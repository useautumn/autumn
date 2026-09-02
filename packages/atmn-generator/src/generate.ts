import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emitFeaturesModule } from "./emit/emitFeatures";
import { OVERLAY } from "./overlay/overlay";
import { collectionItemSchema, loadSpec } from "./spec/loadSpec";

const OUTPUT_DIR = join(import.meta.dir, "../../atmn-nightly/src/generated");
const REPO_ROOT = join(import.meta.dir, "../../..");

/**
 * Emitted source is not formatted by hand — it goes through the repo-pinned
 * Biome, which owns indentation, quotes and trailing commas. Emitting ugly is
 * fine; emitting inconsistently is what would make the regen-clean check noisy.
 */
const formatWithBiome = async ({
	paths,
}: {
	paths: string[];
}): Promise<void> => {
	const biome = join(REPO_ROOT, "node_modules/.bin/biome");
	const result = Bun.spawnSync([
		biome,
		"check",
		"--write",
		"--no-errors-on-unmatched",
		...paths,
	]);
	if (result.exitCode !== 0) {
		throw new Error(
			`biome failed on generated output:\n${result.stderr.toString()}`,
		);
	}
};

export const generate = async (): Promise<string[]> => {
	const spec = loadSpec();
	mkdirSync(OUTPUT_DIR, { recursive: true });

	const written: string[] = [];

	const featuresPath = join(OUTPUT_DIR, "features.ts");
	writeFileSync(
		featuresPath,
		emitFeaturesModule({
			schema: collectionItemSchema({ spec, collection: "features" }),
			overlay: OVERLAY,
		}),
		"utf8",
	);
	written.push(featuresPath);

	await formatWithBiome({ paths: written });
	return written;
};

if (import.meta.main) {
	const written = await generate();
	for (const path of written) {
		console.log(`generated ${path.replace(`${REPO_ROOT}/`, "")}`);
	}
}
