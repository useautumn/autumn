import * as fs from "node:fs";
import * as path from "node:path";

const distDir = path.resolve(import.meta.dirname, "../dist");

// The root export is a pure `export * from "@useautumn/sdk"`, so its
// declarations can point at the tsc-emitted per-file tree instead of a rollup.
const sdkEntryDir = path.join(distDir, "sdk");
fs.mkdirSync(sdkEntryDir, { recursive: true });
const rootShim = 'export * from "../sdk-types/index.js";\n';
fs.writeFileSync(path.join(sdkEntryDir, "index.d.ts"), rootShim);
fs.writeFileSync(path.join(sdkEntryDir, "index.d.mts"), rootShim);

// ESM declarations duplicate their CJS siblings byte-for-byte (modulo chunk
// extensions); a re-export shim serves the same types. No entry has a default
// export, so `export *` is lossless.
const skipDirs = new Set(["sdk-types", "standalone", "sdk"]);
let shimmed = 0;
const walk = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (dir === distDir && skipDirs.has(entry.name)) continue;
			walk(fullPath);
			continue;
		}
		if (!entry.name.endsWith(".d.mts")) continue;
		const base = entry.name.slice(0, -".d.mts".length);
		if (!fs.existsSync(path.join(dir, `${base}.d.ts`))) continue;
		fs.writeFileSync(fullPath, `export * from "./${base}.js";\n`);
		shimmed++;
	}
};
walk(distDir);

// ESM-only declaration chunks (hash differs from the CJS twin) become
// unreferenced once every entry .d.mts is a shim onto the .d.ts world.
const declarationFiles = [];
const collect = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (dir === distDir && skipDirs.has(entry.name)) continue;
			collect(fullPath);
		} else if (/\.d\.(ts|mts)$/.test(entry.name)) {
			declarationFiles.push(fullPath);
		}
	}
};
collect(distDir);
const allDeclarationText = declarationFiles
	.map((file) => fs.readFileSync(file, "utf8"))
	.join("\n");
let deleted = 0;
for (const file of declarationFiles) {
	if (!file.endsWith(".d.mts")) continue;
	const base = path.basename(file).slice(0, -".d.mts".length);
	if (fs.existsSync(path.join(path.dirname(file), `${base}.d.ts`))) continue;
	if (allDeclarationText.includes(base)) continue;
	fs.unlinkSync(file);
	deleted++;
}
console.log(
	`dedupe-dts: wrote sdk root shims, shimmed ${shimmed} .d.mts files, deleted ${deleted} orphaned declaration chunks`,
);
