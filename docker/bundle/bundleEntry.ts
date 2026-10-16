import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BuildArtifact } from "bun";
import { assertSourceSemanticsPreserved } from "./assertSourceSemanticsPreserved.ts";
import { EXTERNAL_PACKAGES } from "./externals.ts";
import type { BundleEntry } from "./services.ts";

/** A bare import the bundle left external, with the source file that made it. */
export type ExternalImport = { specifier: string; importer: string };

/** Bun's metafile also flags internal re-exports as external, so match the configured packages. */
const isConfiguredExternal = (specifier: string) =>
	EXTERNAL_PACKAGES.some((pattern) =>
		pattern.endsWith("/*")
			? specifier.startsWith(pattern.slice(0, -1))
			: specifier === pattern || specifier.startsWith(`${pattern}/`),
	);

const NODE_ENV_READ = "process.env.NODE_ENV";

/** Guards the define below: if any inlined source reads NODE_ENV, the bundle must still read it at runtime. */
const assertNodeEnvReadAtRuntime = async ({
	entryName,
	inputFiles,
	outputs,
}: {
	entryName: string;
	inputFiles: string[];
	outputs: BuildArtifact[];
}) => {
	const sourceReadsNodeEnv = inputFiles.some((file) =>
		readFileSync(resolve(file), "utf8").includes(NODE_ENV_READ),
	);
	const entryOutput = outputs.find((output) => output.kind === "entry-point");
	const bundleReadsNodeEnv = ((await entryOutput?.text()) ?? "").includes(
		NODE_ENV_READ,
	);
	if (sourceReadsNodeEnv && !bundleReadsNodeEnv) {
		throw new Error(`${entryName}: NODE_ENV was inlined at build time`);
	}
};

/** Bundles one entrypoint into <outDir>/dist/<name>/ and returns the imports it left external. */
export const bundleEntry = async ({
	repoRoot,
	outDir,
	entry,
}: {
	repoRoot: string;
	outDir: string;
	entry: BundleEntry;
}): Promise<ExternalImport[]> => {
	const result = await Bun.build({
		entrypoints: [join(repoRoot, entry.entrypoint)],
		root: repoRoot,
		outdir: join(outDir, "dist", entry.name),
		naming: "index.[ext]",
		target: "bun",
		format: "esm",
		sourcemap: "linked",
		external: EXTERNAL_PACKAGES,
		loader: { ".lua": "text" },
		// Bun otherwise inlines the build machine's NODE_ENV ("development") into every check.
		define: { "process.env.NODE_ENV": "process.env.NODE_ENV" },
		metafile: true,
		throw: false,
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error(`Bundling ${entry.name} failed`);
	}

	const inputs = result.metafile?.inputs ?? {};
	assertSourceSemanticsPreserved({ entryName: entry.name, inputs });
	await assertNodeEnvReadAtRuntime({
		entryName: entry.name,
		inputFiles: Object.keys(inputs),
		outputs: result.outputs,
	});

	return Object.entries(inputs).flatMap(([importer, input]) =>
		input.imports
			.map((imported) => imported.original ?? imported.path)
			.filter(isConfiguredExternal)
			.map((specifier) => ({ specifier, importer: resolve(importer) })),
	);
};
