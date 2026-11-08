import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GameManifest } from "../shared/types";
import type { InstalledStoreGame } from "../shared/store-model";
import {
  newLocalGame,
  ASSET_ID,
  type ArtworkSlot,
} from "../shared/studio-model";
import { LibraryStore } from "./library-store";
import { importImage, importImageBytes } from "./library-images";
import {
  defaultSteamRoots,
  discoverStores,
  localSteamArt,
  normalizeTitle,
} from "./store-discovery";
import { officialBytes, storeMetadata } from "./store-metadata";

export class StoreImporter {
  private candidates = new Map<string, InstalledStoreGame>();
  constructor(
    private store: LibraryStore,
    private builtIns: GameManifest[],
  ) {}
  async scan() {
    const result = await discoverStores();
    const existing = this.store.list();
    result.games.forEach((g) => {
      g.alreadyAdded =
        existing.some(
          (r) =>
            (r.storeRef?.store === g.store &&
              r.storeRef.id === g.storeId &&
              r.storeRef.namespace === g.namespace) ||
            g.executables.some(
              (e) => e.toLowerCase() === r.launch.executable.toLowerCase(),
            ),
        ) ||
        this.builtIns.some(
          (r) =>
            r.runtime === "native" &&
            normalizeTitle(r.title) === normalizeTitle(g.name),
        );
    });
    this.candidates = new Map(result.games.map((g) => [g.key, g]));
    return result;
  }
  async prepare(key: string, executable?: string) {
    const selected = this.candidates.get(key);
    if (!selected)
      throw new Error("Scan installed games again before choosing one.");
    if (selected.alreadyAdded)
      throw new Error(
        "This game is already in your library. Edit its existing card.",
      );
    const candidate = executable || selected.executable;
    if (!candidate || !selected.executables.includes(candidate))
      throw new Error("Choose an executable from the scanned installation.");
    const validated = await this.store.validateExecutable(candidate);
    const game = newLocalGame(),
      notes: string[] = [];
    game.title = selected.name.slice(0, 120);
    game.tags = [selected.store === "steam" ? "Steam" : "Epic Games"];
    game.launch = {
      executable: validated!,
      cwd: path.dirname(validated!),
      args: [],
      attachOnly: false,
      method: "auto",
    };
    game.storeRef = {
      store: selected.store,
      id: selected.storeId,
      namespace: selected.namespace,
      appName: selected.appName,
    };
    const cache = path.join(this.store.directory, "store-cache"),
      hash = createHash("sha256").update(selected.key).digest("hex"),
      artFile = path.join(cache, hash + "-art.json");
    try {
      const artwork = JSON.parse(await readFile(artFile, "utf8"));
      for (const purpose of ["cover", "banner"] as const) {
        const a = artwork[purpose];
        if (a && ASSET_ID.test(a.asset) && a.asset === a.source) {
          await this.store.readAsset(a.asset);
          game.artwork[purpose] = a;
        }
      }
    } catch {}
    if (selected.store === "steam") {
      const local = await localSteamArt(
        selected.storeId,
        await defaultSteamRoots(),
      );
      for (const purpose of ["cover", "banner"] as const)
        if (!game.artwork[purpose] && local[purpose])
          try {
            const image = await importImage(this.store, local[purpose]!);
            game.artwork[purpose] = this.artwork(image.id);
          } catch {}
    }
    try {
      const { metadata, cached } = await storeMetadata(
        selected,
        this.store.directory,
      );
      game.description = metadata.description;
      game.tags = [...new Set([...game.tags, ...metadata.tags])].slice(0, 12);
      const failures: string[] = [];
      await Promise.all(
        (["cover", "banner"] as const).map(async (purpose) => {
          if (game.artwork[purpose]) return;
          const urls =
            purpose === "cover" && selected.store === "steam"
              ? [
                  metadata.cover,
                  `https://cdn.akamai.steamstatic.com/steam/apps/${selected.storeId}/library_600x900.jpg`,
                ]
              : purpose === "banner" && selected.store === "steam"
                ? [
                    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${selected.storeId}/library_hero.jpg`,
                    metadata.banner,
                  ]
                : [metadata[purpose]];
          for (const url of urls)
            if (typeof url === "string")
              try {
                const image = await importImageBytes(
                  this.store,
                  await officialBytes(url, true),
                );
                game.artwork[purpose] = this.artwork(image.id);
                return;
              } catch {}
          failures.push(purpose);
        }),
      );
      notes.push(
        cached
          ? "Using metadata cached on this PC."
          : "Official store details downloaded and cached on this PC.",
      );
      if (failures.length)
        notes.push(
          `Some artwork is unavailable (${failures.join(", ")}). You can add your own images.`,
        );
    } catch {
      notes.push(
        "Online details are unavailable right now. Local installation details and available artwork are ready; you can edit the rest yourself.",
      );
    }
    await mkdir(cache, { recursive: true });
    await writeFile(artFile + ".tmp", JSON.stringify(game.artwork), {
      mode: 0o600,
    });
    await rename(artFile + ".tmp", artFile);
    notes.push(
      "Review the executable, player count, connectivity and controls. Importing details does not verify gameplay or launch the game.",
    );
    return { game, notes };
  }
  private artwork(id: string): ArtworkSlot {
    return {
      source: id,
      asset: id,
      crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, ratio: "original" },
      fit: "cover",
    };
  }
}
