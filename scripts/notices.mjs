import { readFile, readdir, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
const project = process.cwd();
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const seen = new Set();
const packages = [];
async function locate(name, start) {
  let directory = start;
  while (true) {
    const target = path.join(
      directory,
      "node_modules",
      ...name.split("/"),
      "package.json",
    );
    try {
      await access(target);
      return path.dirname(target);
    } catch {}
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error(`Missing dependency license: ${name}`);
    directory = parent;
  }
}
async function visit(name, start) {
  const directory = await locate(name, start);
  if (seen.has(directory)) return;
  seen.add(directory);
  const metadata = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  const files = (await readdir(directory)).filter((filename) =>
    /^(licen[sc]e|copying|notice)([.-].*)?$/i.test(filename),
  );
  const texts = [];
  for (const filename of files) {
    try {
      texts.push(
        `${filename}\n${await readFile(path.join(directory, filename), "utf8")}`,
      );
    } catch {}
  }
  packages.push({
    name: metadata.name,
    version: metadata.version,
    license: metadata.license || "See package notice",
    repository: metadata.repository,
    notices: texts,
  });
  for (const dependency of Object.keys(metadata.dependencies || {}))
    await visit(dependency, directory);
}
for (const dependency of Object.keys(manifest.dependencies || {}))
  await visit(dependency, project);
packages.sort((a, b) => a.name.localeCompare(b.name));
await mkdir("build/notices", { recursive: true });
await writeFile(
  "build/notices/THIRD-PARTY-NOTICES.txt",
  packages
    .map(
      (p) =>
        `${"=".repeat(72)}\n${p.name} ${p.version}\nLicense: ${typeof p.license === "string" ? p.license : JSON.stringify(p.license)}\n\n${p.notices.length ? p.notices.join("\n\n") : "Consult the upstream package repository for additional notices."}`,
    )
    .join("\n\n"),
);
await writeFile(
  "build/notices/dependencies.json",
  JSON.stringify(
    packages.map(({ notices, ...metadata }) => metadata),
    null,
    2,
  ),
);
console.log(
  `Included license notices for ${packages.length} runtime packages.`,
);

await writeFile("build/notices/Tabler-Icons-LICENSE.txt",await readFile("assets/public/assets/controller-icons/LICENSE.txt"));
