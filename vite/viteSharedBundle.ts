import path from "node:path";
import { type BuildContext, context } from "esbuild";
import type { Plugin } from "vite";

export function sharedBundle({ sharedDir }: { sharedDir: string }): Plugin {
	const entry = path.join(sharedDir, "index.ts");
	const bundleId = path.join(sharedDir, "__vite_shared_bundle__.js");
	let build: BuildContext | undefined;

	return {
		name: "autumn-shared-bundle",
		enforce: "pre",
		apply: "serve",
		resolveId(source, importer, options) {
			if (source === "@autumn/shared") return bundleId;
			if (importer === bundleId) {
				return this.resolve(source, entry, { ...options, skipSelf: true });
			}
		},
		async load(id) {
			if (id !== bundleId) return;
			build ??= await context({
				entryPoints: [entry],
				bundle: true,
				format: "esm",
				platform: "browser",
				target: "es2022",
				packages: "external",
				sourcemap: "inline",
				write: false,
				logLevel: "silent",
			});
			const { outputFiles } = await build.rebuild();
			return outputFiles?.[0]?.text;
		},
		configureServer(server) {
			server.watcher.add(sharedDir);
			server.watcher.on("change", (file) => {
				if (!file.startsWith(sharedDir) || file.includes("node_modules"))
					return;
				const bundle = server.moduleGraph.getModuleById(bundleId);
				if (bundle) server.reloadModule(bundle);
			});
			server.httpServer?.on("close", () => build?.dispose());
		},
	};
}
