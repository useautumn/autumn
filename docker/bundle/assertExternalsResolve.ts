import { readdirSync, readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join } from "node:path";

// Bundled CommonJS keeps external requires as __require("name").
const REQUIRE_CALL = /__require\("([^"./][^"]*)"\)/g;

/** Every package a shipped bundle imports must resolve inside the shipped tree, or the service won't boot. */
export const assertExternalsResolve = ({ outDir }: { outDir: string }) => {
	const distDir = join(outDir, "dist");
	const transpiler = new Bun.Transpiler({ loader: "js" });

	const unresolved = readdirSync(distDir, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".js"))
		.flatMap((file) => {
			const bundlePath = join(distDir, file);
			const code = readFileSync(bundlePath, "utf8");
			const required = [...code.matchAll(REQUIRE_CALL)].map(
				(match) => match[1] as string,
			);
			const imported = transpiler.scanImports(code).map((entry) => entry.path);
			return [...new Set([...imported, ...required])]
				.filter((path) => !isBuiltin(path) && !path.startsWith("bun:"))
				.filter((path) => {
					try {
						Bun.resolveSync(path, dirname(bundlePath));
						return false;
					} catch {
						return true;
					}
				})
				.map((path) => `${file}: ${path}`);
		});

	if (unresolved.length > 0) {
		throw new Error(
			`Bundles import packages missing from the image:\n${[...new Set(unresolved)].join("\n")}`,
		);
	}
};
