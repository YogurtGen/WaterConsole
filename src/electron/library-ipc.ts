import { app, dialog, ipcMain } from "electron";
import { readFile, writeFile, cp, stat, lstat } from "node:fs/promises";
import path from "node:path";
import { GAMES, type GameManifest } from "../shared/types";
import type {
  ControllerDefinition,
  LibraryCommand,
  LibraryResult,
} from "../shared/studio-model";
import { LibraryStore } from "./library-store";
import { importImage, cropImage } from "./library-images";
import type { NativeRouter } from "./native-router";
export class LibraryCoordinator {
  store!: LibraryStore;
  private locked = false;
  constructor(
    private runtime: () => NativeRouter | null,
    private validSender: (event: Electron.IpcMainInvokeEvent) => void,
    private sync: (
      catalog: GameManifest[],
      definitions: Record<string, ControllerDefinition>,
      assetsDir: string,
    ) => Promise<unknown>,
    private preview: (
      gameId: string,
      definition: ControllerDefinition,
      modeId: string,
    ) => Promise<any>,
    private endPreview: () => Promise<any>,
  ) {}
  async initialize() {
    let base =
      process.env.WATERCONSOLE_LIBRARY_DIR ||
      process.env.WATERCONSOLE_DATA_DIR ||
      (app.isPackaged
        ? path.resolve(
            path.dirname(app.getPath("exe")),
            "..",
            "WaterConsole-Core-data",
          )
        : path.join(app.getAppPath(), ".local", "user-data"));
    if (
      !process.env.WATERCONSOLE_LIBRARY_DIR &&
      !process.env.WATERCONSOLE_DATA_DIR
    ) {
      try {
        const locator = JSON.parse(
          await readFile(
            path.join(app.getPath("userData"), "library-location.json"),
            "utf8",
          ),
        );
        if (
          typeof locator.directory === "string" &&
          path.isAbsolute(locator.directory)
        )
          base = locator.directory;
      } catch {}
    }
    this.store = new LibraryStore(base, [app.getPath("exe"), process.execPath]);
    await this.store.initialize();
  }
  config() {
    return {
      catalog: [...GAMES, ...this.store.manifests()],
      controllerDefinitions: this.store.definitions(),
      libraryAssetsDir: this.store.assetsDirectory,
    };
  }
  private async publish() {
    await this.runtime()?.refresh();
    const c = this.config();
    await this.sync(c.catalog, c.controllerDefinitions, c.libraryAssetsDir);
  }
  register() {
    ipcMain.handle(
      "wc:library",
      async (event, command: LibraryCommand): Promise<LibraryResult> => {
        this.validSender(event);
        if (
          !command ||
          typeof command !== "object" ||
          typeof command.type !== "string"
        )
          return { ok: false, error: "Invalid library request." };
        if (command.type === "list")
          return { ok: true, games: this.store.list() };
        if (command.type === "load-draft")
          return { ok: true, game: await this.store.loadDraft() };
        if (command.type === "storage")
          return { ok: true, config: { directory: this.store.directory } };
        if (command.type === "capabilities")
          return { ok: true, config: await this.runtime()?.probe() };
        if (this.locked)
          return {
            ok: false,
            error: "Another library operation is running. Please try again.",
          };
        this.locked = true;
        try {
          switch (command.type) {
            case "running-windows":
              return {
                ok: true,
                windows: (await this.runtime()?.windows()) ?? [],
              };
            case "choose-executable": {
              const choice = await dialog.showOpenDialog({
                title: "Choose the original game executable",
                properties: ["openFile"],
                filters: [
                  { name: "Windows game executable", extensions: ["exe"] },
                ],
              });
              if (choice.canceled) return { ok: false };
              const selected = await this.store.validateExecutable(
                choice.filePaths[0],
              );
              return {
                ok: true,
                file: { name: path.basename(selected!), path: selected },
              };
            }
            case "choose-image": {
              const choice = await dialog.showOpenDialog({
                title: "Choose local artwork",
                properties: ["openFile"],
                filters: [
                  {
                    name: "Images",
                    extensions: ["png", "jpg", "jpeg", "webp"],
                  },
                ],
              });
              if (choice.canceled) return { ok: false };
              const image = await importImage(this.store, choice.filePaths[0]);
              return {
                ok: true,
                file: { name: path.basename(choice.filePaths[0]), ...image },
              };
            }
            case "crop": {
              const result = await cropImage(
                this.store,
                command.source,
                command.crop,
                command.purpose,
              );
              return { ok: true, file: { name: "Cropped artwork", ...result } };
            }
            case "save-draft":
              await this.store.saveDraft(command.game);
              return { ok: true };
            case "save": {
              if (this.runtime()?.isActive())
                return {
                  ok: false,
                  error:
                    "Stop the active game before applying edits. Your draft can still be saved.",
                };
              const game = await this.store.save(command.game);
              await this.publish();
              return { ok: true, game, games: this.store.list() };
            }
            case "duplicate": {
              if (this.runtime()?.isActive())
                throw new Error(
                  "Stop the active game before changing the library.",
                );
              const game = await this.store.duplicate(command.id);
              await this.publish();
              return { ok: true, game, games: this.store.list() };
            }
            case "remove":
              if (this.runtime()?.isActive())
                throw new Error(
                  "Stop the active game before removing an entry.",
                );
              await this.store.remove(command.id);
              await this.publish();
              return { ok: true, games: this.store.list() };
            case "processes":
              return {
                ok: true,
                config: await this.runtime()?.processes(command.executable),
              };
            case "preview":
              return await this.preview(
                command.gameId,
                command.definition,
                command.modeId,
              );
            case "end-preview":
              return await this.endPreview();
            case "choose-storage": {
              if (this.runtime()?.isActive())
                throw new Error("Stop the game before moving library data.");
              const chosen = await dialog.showOpenDialog({
                title: "Choose a folder for your WaterConsole library",
                properties: ["openDirectory", "createDirectory"],
                defaultPath: path.dirname(this.store.directory),
              });
              if (chosen.canceled) return { ok: false };
              const base = path.resolve(chosen.filePaths[0]),
                destination = path.join(base, "library"),
                previous = path.resolve(this.store.directory),
                sourceRoot = path.resolve(app.getAppPath());
              if (destination === previous)
                return { ok: true, config: { directory: previous } };
              if (
                destination.startsWith(previous + path.sep) ||
                previous.startsWith(destination + path.sep) ||
                destination.startsWith(sourceRoot + path.sep)
              )
                throw new Error(
                  "Choose a separate data folder outside the application/source directory.",
                );
              let exists = false;
              try {
                await stat(destination);
                exists = true;
              } catch {}
              if (exists)
                throw new Error(
                  "That folder already contains a library. Choose another location to preserve both libraries.",
                );
              await cp(previous, destination, {
                recursive: true,
                filter: async (src) => !(await lstat(src)).isSymbolicLink(),
              });
              const next = new LibraryStore(base, [
                app.getPath("exe"),
                process.execPath,
              ]);
              await next.initialize();
              await writeFile(
                path.join(app.getPath("userData"), "library-location.json"),
                JSON.stringify({ directory: base }),
                { mode: 0o600 },
              );
              this.store = next;
              this.runtime()?.setStore(next);
              await this.publish();
              return {
                ok: true,
                config: { directory: next.directory, previousPreserved: true },
              };
            }
            default:
              return { ok: false, error: "Unknown library action." };
          }
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "The library action failed. Your saved entries were preserved.",
          };
        } finally {
          this.locked = false;
        }
      },
    );
  }
}
