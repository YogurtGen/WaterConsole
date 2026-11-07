import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { GAMES, validGameId } from "../shared/types";

export async function loadLocalGameArtwork(directory: string) {
  const artwork = new Map<string, Uint8Array>();
  for (const game of GAMES) {
    if (!validGameId(game.id)) continue;
    for (const variant of ["cover", "hero"] as const) {
      try {
        const filename = path.join(directory, game.id, `${variant}.jpg`);
        const info = await stat(filename);
        if (!info.isFile() || info.size < 4 || info.size > 8 * 1024 * 1024)
          continue;
        const bytes = await readFile(filename);
        if (bytes[0] === 0xff && bytes[1] === 0xd8)
          artwork.set(
            `library-art/${game.id}-${variant}`,
            new Uint8Array(bytes),
          );
      } catch {
        /* Optional PC artwork uses the bundled original fallback. */
      }
    }
  }
  return artwork;
}
