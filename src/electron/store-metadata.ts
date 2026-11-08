import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { InstalledStoreGame } from "../shared/store-model";

const apiHosts = new Set([
  "store.steampowered.com",
  "store-content.ak.epicgames.com",
]);
const imageHosts = new Set([
  "shared.fastly.steamstatic.com",
  "shared.akamai.steamstatic.com",
  "cdn.akamai.steamstatic.com",
  "steamcdn-a.akamaihd.net",
  "cdn.cloudflare.steamstatic.com",
  "cdn1.epicgames.com",
  "cdn2.unrealengine.com",
  "cdn1.unrealengine.com",
]);
export function officialURL(value: string, image = false) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !(image ? imageHosts : apiHosts).has(u.hostname)
  )
    throw new Error("Unsupported metadata source.");
  return u;
}
export async function officialBytes(
  url: string,
  image = false,
  fetcher: typeof fetch = fetch,
): Promise<Buffer> {
  const signal = AbortSignal.timeout(6500),
    max = image ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(officialURL(url, image), {
      signal,
      redirect: "manual",
      credentials: "omit",
      headers: {
        Accept: image ? "image/png,image/jpeg,image/webp" : "application/json",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(response.headers.get("location") || "", url).href;
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Official source is unavailable.");
    }
    if (Number(response.headers.get("content-length")) > max) {
      await response.body.cancel();
      throw new Error("Metadata response is too large.");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > max) {
        throw new Error("Metadata response is too large.");
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many metadata redirects.");
}
export const plainText = (s: unknown, max = 2000) =>
  typeof s === "string"
    ? s
        .replace(/<[^>]*>/g, " ")
        .replace(
          /&(?:nbsp|amp|quot|apos|lt|gt);/g,
          (e) =>
            ({
              "&nbsp;": " ",
              "&amp;": "&",
              "&quot;": '"',
              "&apos;": "'",
              "&lt;": "<",
              "&gt;": ">",
            })[e] || " ",
        )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
export interface StoreMetadata {
  description: string;
  tags: string[];
  cover?: string;
  banner?: string;
}
export function parseSteamMetadata(data: any, id: string): StoreMetadata {
  const item = data?.[id];
  if (!item?.success || item.data?.steam_appid !== Number(id))
    throw new Error("Steam returned a different game.");
  const d = item.data;
  return {
    description: plainText(d.short_description || d.about_the_game),
    tags: (Array.isArray(d.genres) ? d.genres : [])
      .map((x: any) => plainText(x.description, 24))
      .filter(Boolean)
      .slice(0, 12),
    cover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
    banner: d.header_image,
  };
}
export function epicSlug(title: string) {
  return title
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f™®©'’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function parseEpicMetadata(data: any, namespace: string): StoreMetadata {
  if (data?.namespace !== namespace)
    throw new Error("Epic returned a different game.");
  const page =
    data.pages?.find(
      (p: any) => p.namespace === namespace && p._slug === "home",
    ) || data.pages?.find((p: any) => p.namespace === namespace);
  if (!page?.data) throw new Error("Epic metadata is unavailable.");
  const d = page.data;
  const genre = d.about?.genre;
  return {
    description: plainText(d.about?.shortDescription || d.about?.description),
    tags: typeof genre === "string" ? [plainText(genre, 24)] : [],
    cover: d.hero?.portraitBackgroundImageUrl,
    banner: d.hero?.backgroundImageUrl || d.about?.image,
  };
}
export async function storeMetadata(
  game: InstalledStoreGame,
  directory: string,
) {
  const cache = path.join(directory, "store-cache"),
    key = createHash("sha256").update(game.key).digest("hex"),
    file = path.join(cache, key + ".json");
  try {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (
      data.key === game.key &&
      data.metadata &&
      typeof data.metadata.description === "string" &&
      Array.isArray(data.metadata.tags)
    ) {
      const m = data.metadata as StoreMetadata;
      for (const image of [m.cover, m.banner])
        if (image) officialURL(image, true);
      return { metadata: m, cached: true };
    }
  } catch {}
  const url =
    game.store === "steam"
      ? `https://store.steampowered.com/api/appdetails?appids=${game.storeId}&l=english&cc=US`
      : `https://store-content.ak.epicgames.com/api/en-US/content/products/${epicSlug(game.name)}`;
  const data = JSON.parse((await officialBytes(url)).toString("utf8"));
  const metadata =
    game.store === "steam"
      ? parseSteamMetadata(data, game.storeId)
      : parseEpicMetadata(data, game.namespace!);
  for (const k of ["cover", "banner"] as const)
    try {
      if (metadata[k]) officialURL(metadata[k], true);
    } catch {
      delete metadata[k];
    }
  await mkdir(cache, { recursive: true });
  await writeFile(file + ".tmp", JSON.stringify({ key: game.key, metadata }), {
    mode: 0o600,
  });
  await rename(file + ".tmp", file);
  return { metadata, cached: false };
}
