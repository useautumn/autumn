import { resolve } from "node:path";
import { toCamelCase } from "../casing/schemaKeyCasing";
import { COLLECTIONS } from "../collections";
import { OVERLAY } from "../overlay/overlay";
import { catalogUpdateSchema, loadSpec } from "../spec/loadSpec";
import { coverageReport, formatCoverageReport } from "./coverageReport";
import { documentPaths } from "./documentPaths";
import { schemaPaths } from "./schemaPaths";

/**
 * How much of the catalog schema a config exercises: one report per
 * top-level collection the config's wire document actually states.
 */
export const runFuzz = async ({
	configPath,
}: {
	configPath: string;
}): Promise<void> => {
	// Cache-busted so a second run in the same process sees an edited config,
	// not the first import cached under the plain path.
	const module = await import(`${configPath}?v=${Date.now()}`);
	const document = module.default as Record<string, unknown>;

	const spec = loadSpec();
	const root = spec as never;
	const schema = schemaPaths({
		schema: catalogUpdateSchema({ spec }),
		root,
		overlay: OVERLAY,
	});
	const touched = documentPaths({ document });

	for (const wireKey of Object.keys(document)) {
		// Constants like skip_deletions are not catalog collections.
		if (!(wireKey in COLLECTIONS)) continue;
		const collection = toCamelCase(wireKey);
		const report = coverageReport({ schema, document: touched, collection });
		console.log(formatCoverageReport({ report, collection }));
	}
};

if (import.meta.main) {
	// A dynamic import resolves relative to this file, not the caller's shell.
	const configPath = process.argv[2] && resolve(process.cwd(), process.argv[2]);
	if (!configPath) {
		console.error("usage: bun run fuzz <path/to/autumn.config.ts>");
		process.exit(1);
	}
	await runFuzz({ configPath });
}
