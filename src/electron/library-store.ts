import {
  readFile,
  writeFile,
  mkdir,
  rename,
  copyFile,
  stat,
  realpath,
  open,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import {
  ASSET_ID,
  type LocalGameRecord,
  type ControllerDefinition,
  gameManifest,
} from "../shared/studio-model";
import { controllerAssets, validateGame } from "../shared/studio-validation";
export class LibraryStore {
  private records: LocalGameRecord[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  readonly directory: string;
  readonly assetsDirectory: string;
  constructor(
    dataDirectory: string,
    private blockedExecutables: string[] = [],
  ) {
    this.directory = path.join(dataDirectory, "library");
    this.assetsDirectory = path.join(this.directory, "images");
  }
  recoveryMessage?: string;
  private parseCatalog(bytes: string) {
    if (bytes.length > 32 * 1024 * 1024)
      throw new Error("Library file too large.");
    const data = JSON.parse(bytes);
    if (
      data.version !== 1 ||
      !Array.isArray(data.games) ||
      data.games.length > 200
    )
      throw new Error("Unsupported library file.");
    data.games.forEach(validateGame);
    return data.games as LocalGameRecord[];
  }
  async initialize() {
    await mkdir(this.assetsDirectory, { recursive: true });
    try {
      this.records = this.parseCatalog(
        await readFile(path.join(this.directory, "catalog.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        try {
          await copyFile(
            path.join(this.directory, "catalog.json"),
            path.join(this.directory, "recovery-" + Date.now() + ".json"),
          );
        } catch {}
        try {
          this.records = this.parseCatalog(
            await readFile(
              path.join(this.directory, "catalog.previous.json"),
              "utf8",
            ),
          );
          this.recoveryMessage =
            "Recovered the previous library backup. The damaged catalog was preserved in the data folder.";
          await writeFile(
            path.join(this.directory, "catalog.json"),
            JSON.stringify({ version: 1, games: this.records }, null, 2),
            { mode: 0o600 },
          );
        } catch {
          throw new Error(
            "The saved library needs recovery. Its files were preserved; check the library data folder.",
          );
        }
      }
    }
    return this.list();
  }
  list() {
    return structuredClone(this.records);
  }
  get(id: string) {
    const record = this.records.find((g) => g.id === id);
    return record ? structuredClone(record) : undefined;
  }
  manifests() {
    return this.records.map(gameManifest);
  }
  definitions() {
    return Object.fromEntries(this.records.map((g) => [g.id, g.controller]));
  }
  async validateExecutable(filename: string) {
    if (!filename) return;
    const target = await realpath(filename);
    if (
      !path.isAbsolute(filename) ||
      path.extname(target).toLowerCase() !== ".exe"
    )
      throw new Error("Choose the original Windows game executable (.exe).");
    if (
      this.blockedExecutables.some(
        (p) => path.resolve(p).toLowerCase() === target.toLowerCase(),
      ) ||
      /^(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|conhost)\.exe$/i.test(
        path.basename(target),
      )
    )
      throw new Error(
        "Choose a game executable, not a command interpreter or WaterConsole itself.",
      );
    const info = await stat(target);
    if (!info.isFile()) throw new Error("The game executable is missing.");
    const file = await open(target, "r");
    try {
      const head = Buffer.alloc(64);
      await file.read(head, 0, 64, 0);
      if (head[0] !== 77 || head[1] !== 90)
        throw new Error("This file is not a Windows executable.");
      const offset = head.readUInt32LE(60);
      if (offset < 64 || offset > info.size - 4)
        throw new Error("The executable header is invalid.");
      const pe = Buffer.alloc(4);
      await file.read(pe, 0, 4, offset);
      if (pe.readUInt32LE(0) !== 0x4550)
        throw new Error("The executable header is invalid.");
    } finally {
      await file.close();
    }
    return target;
  }
  private async commit(next: LocalGameRecord[]) {
    const file = path.join(this.directory, "catalog.json"),
      tmp = file + "." + randomUUID() + ".tmp";
    try {
      await copyFile(file, path.join(this.directory, "catalog.previous.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(tmp, JSON.stringify({ version: 1, games: next }, null, 2), {
      mode: 0o600,
    });
    await rename(tmp, file);
    this.records = next;
  }
  private queue<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.chain.catch(() => {}).then(task);
    this.chain = operation;
    return operation;
  }
  async save(value: unknown) {
    validateGame(value);
    const snapshot = structuredClone(value);
    return this.queue(() => this.saveNow(snapshot));
  }
  private async saveNow(value: LocalGameRecord) {
    const record = structuredClone(value);
    if (record.launch.executable) {
      record.launch.executable = (await this.validateExecutable(
        record.launch.executable,
      ))!;
      if (!record.launch.cwd)
        record.launch.cwd = path.dirname(record.launch.executable);
      const cwd = await realpath(record.launch.cwd);
      if (!(await stat(cwd)).isDirectory())
        throw new Error("Choose an existing game working directory.");
      record.launch.cwd = cwd;
    }
    for (const art of Object.values(record.artwork))
      if (art) {
        await this.readAsset(art.source);
        await this.readAsset(art.asset);
      }
    for (const id of new Set([
      ...controllerAssets(record.controller),
      ...record.controller.modes.flatMap((m) =>
        m.controls.flatMap((c) =>
          [c.imageSource, c.pressedImageSource].filter(
            (id): id is string => !!id,
          ),
        ),
      ),
    ]))
      await this.readAsset(id);
    const existing = this.get(record.id);
    if (existing && record.revision !== existing.revision)
      throw new Error(
        "This game changed in another editor. Reopen it before saving.",
      );
    record.revision = (existing?.revision ?? 0) + 1;
    record.controller.revision = (existing?.controller.revision ?? 0) + 1;
    record.updatedAt = new Date().toISOString();
    if (
      existing &&
      (JSON.stringify(existing.bindings) !== JSON.stringify(record.bindings) ||
        JSON.stringify(existing.launch) !== JSON.stringify(record.launch) ||
        existing.inputMethod !== record.inputMethod)
    ) {
      record.tests = {
        ...record.tests,
        launch: false,
        menu: false,
        gameplay: false,
        offline: false,
      };
    }
    const next = this.list();
    const index = next.findIndex((g) => g.id === record.id);
    if (index >= 0) next[index] = record;
    else {
      if (next.length >= 200)
        throw new Error("The local library currently supports 200 entries.");
      next.push(record);
    }
    await this.commit(next);
    return record;
  }
  async remove(id: string) {
    return this.queue(async () => {
      if (!this.records.some((g) => g.id === id))
        throw new Error("Game not found.");
      await this.commit(this.records.filter((g) => g.id !== id));
    });
  }
  async duplicate(id: string) {
    const game = this.get(id);
    if (!game) throw new Error("Game not found.");
    game.id = "local-" + randomUUID();
    game.revision = 0;
    game.title = (game.title + " (copy)").slice(0, 120);
    return this.save(game);
  }
  async saveDraft(game: unknown) {
    validateGame(game);
    const file = path.join(this.directory, "draft.json");
    await writeFile(file + ".tmp", JSON.stringify(game), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
  async loadDraft() {
    try {
      const data = JSON.parse(
        await readFile(path.join(this.directory, "draft.json"), "utf8"),
      );
      validateGame(data);
      return data;
    } catch {
      return undefined;
    }
  }
  async writeAsset(bytes: Buffer) {
    if (
      bytes.length > 32 * 1024 * 1024 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error("Only normalized local PNG assets can be stored.");
    const id = createHash("sha256").update(bytes).digest("hex");
    await writeFile(path.join(this.assetsDirectory, id + ".png"), bytes, {
      mode: 0o600,
    });
    return id;
  }
  async readAsset(id: string) {
    if (!ASSET_ID.test(id)) throw new Error("Invalid image reference.");
    const root = await realpath(this.assetsDirectory),
      file = await realpath(path.join(root, id + ".png"));
    if (!file.startsWith(root + path.sep))
      throw new Error("Image outside library.");
    const info = await stat(file);
    if (!info.isFile() || info.size > 32 * 1024 * 1024)
      throw new Error("Image is too large.");
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== id)
      throw new Error("Image integrity check failed.");
    return bytes;
  }
}
