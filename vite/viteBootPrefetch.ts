import path from "node:path";
import { build } from "esbuild";
import type { IndexHtmlTransformContext, Plugin } from "vite";
import { ROUTE_MODULES } from "./src/boot/bootRequests.ts";

type Bundle = NonNullable<IndexHtmlTransformContext["bundle"]>;

/** Each lazy route's chunk plus everything it imports statically, as URLs. */
const routeAssets = ({ bundle, base }: { bundle?: Bundle; base: string }) => {
	if (!bundle) return {};
	const chunks = Object.values(bundle).filter(
		(output) => output.type === "chunk",
	);
	const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
	const closure = (fileName: string, seen = new Set<string>()) => {
		if (seen.has(fileName)) return seen;
		seen.add(fileName);
		for (const imported of byFile.get(fileName)?.imports ?? [])
			closure(imported, seen);
		return seen;
	};
	const entry = chunks.find((chunk) => chunk.isEntry);
	const loadedWithEntry = entry ? closure(entry.fileName) : new Set<string>();

	return Object.fromEntries(
		Object.entries(ROUTE_MODULES).flatMap(([route, modulePath]) => {
			// Small chunks get merged, so a page module isn't always its chunk's facade.
			const chunk = chunks.find((candidate) =>
				candidate.moduleIds.some((id) => id.endsWith(modulePath)),
			);
			if (!chunk) return [];
			const files = [...closure(chunk.fileName)].filter(
				(file) => !loadedWithEntry.has(file),
			);
			return [[route, files.map((file) => `${base}${file}`)]];
		}),
	);
};

/** Inlines src/boot/bootPrefetch.ts as the first script, so the landing page's requests and chunks start before the entry runs. */
export function bootPrefetch(): Plugin {
	let backendUrl = "";
	let base = "/";

	const compile = async (assets: Record<string, string[]>) => {
		const result = await build({
			entryPoints: [path.resolve(__dirname, "src/boot/bootPrefetch.ts")],
			bundle: true,
			format: "iife",
			minify: true,
			target: "es2020",
			platform: "browser",
			write: false,
			logLevel: "silent",
			define: {
				"import.meta.env.VITE_BACKEND_URL": JSON.stringify(backendUrl),
				__BOOT_ROUTE_ASSETS__: JSON.stringify(assets),
			},
		});
		return result.outputFiles[0].text;
	};

	return {
		name: "autumn-boot-prefetch",
		configResolved(config) {
			backendUrl = config.env.VITE_BACKEND_URL ?? "";
			base = config.base;
		},
		async transformIndexHtml(_html, ctx) {
			const script = await compile(routeAssets({ bundle: ctx.bundle, base }));
			return [{ tag: "script", children: script, injectTo: "head-prepend" }];
		},
	};
}
