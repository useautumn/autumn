// Copies @useautumn/sdk's tshy build into dist/sdk, one file per module, so
// bundlers can drop the operations and models a consumer never imports.
//
// Each dialect directory gets its own package.json: bundlers read `sideEffects`
// from the nearest package.json, and tshy's marks only the module type.

import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";

const sdkDist = path.resolve(import.meta.dirname, "../../sdk/dist");
const target = path.resolve(import.meta.dirname, "../dist/sdk");

const dialects = [
	{ dir: "esm", type: "module" },
	{ dir: "commonjs", type: "commonjs" },
] as const;

// tshy's source maps point at ../sdk/src, which this package does not ship, so
// they are dropped along with the comments that reference them.
const sourceMapComment = /\n\/\/# sourceMappingURL=\S+\s*$/;

await rm(target, { recursive: true, force: true });

for (const { dir, type } of dialects) {
	const out = path.join(target, dir);
	await cp(path.join(sdkDist, dir), out, {
		recursive: true,
		filter: (source) => !source.endsWith(".map"),
	});
	const files = await readdir(out, { recursive: true });
	for (const file of files) {
		if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
		const filePath = path.join(out, file);
		const source = await readFile(filePath, "utf8");
		const stripped = source.replace(sourceMapComment, "\n");
		if (stripped !== source) await writeFile(filePath, stripped);
	}
	await writeFile(
		path.join(out, "package.json"),
		`${JSON.stringify({ type, sideEffects: false }, null, "\t")}\n`,
	);
}
