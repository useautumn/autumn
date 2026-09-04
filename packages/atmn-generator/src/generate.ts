import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyRuntime } from "./emit/copyRuntime";
import { type ClientOperation, emitClientModule } from "./emit/emitClient";
import { emitFeaturesModule } from "./emit/emitFeatures";
import { emitWireModule } from "./emit/emitWire";
import { wirePathHints } from "./emit/freeFormPaths";
import { emitLintRulesModule } from "./lint/emitLintRules";
import { LINT_REGISTRY } from "./lint/rules/registry";
import { nodeRulesFromSpec } from "./lint/specRules/nodeRulesFromSpec";
import { validateRegistry } from "./lint/validateRegistry";
import { OVERLAY } from "./overlay/overlay";
import {
	catalogUpdateSchema,
	collectionItemSchema,
	loadSpec,
	responseSchema,
	serverBaseUrl,
} from "./spec/loadSpec";

const OUTPUT_DIR = join(import.meta.dir, "../../atmn-nightly/src/generated");
const REPO_ROOT = join(import.meta.dir, "../../..");

const LINT_RUNTIME_SOURCE = join(
	import.meta.dir,
	"lint/runtime/lintDocument.ts",
);

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
	const root = spec as never;
	const envelope = catalogUpdateSchema({ spec });
	mkdirSync(OUTPUT_DIR, { recursive: true });

	const written: string[] = [];
	const write = ({ name, source }: { name: string; source: string }) => {
		const path = join(OUTPUT_DIR, name);
		writeFileSync(path, source, "utf8");
		written.push(path);
	};

	write({
		name: "features.ts",
		source: emitFeaturesModule({
			schema: collectionItemSchema({ spec, collection: "features" }),
			overlay: OVERLAY,
		}),
	});

	const lintRuntimePath = join(OUTPUT_DIR, "lintRuntime.ts");
	copyRuntime({
		from: LINT_RUNTIME_SOURCE,
		to: lintRuntimePath,
		sourceLabel: "packages/atmn-generator/src/lint/runtime/lintDocument.ts",
	});
	written.push(lintRuntimePath);

	// A typo in a rule's path or field would otherwise ship as a rule that
	// never fires.
	validateRegistry({ registry: LINT_REGISTRY, schema: envelope, root });
	write({
		name: "lintRules.ts",
		source: emitLintRulesModule({
			specRules: nodeRulesFromSpec({ schema: envelope, root }),
			registry: LINT_REGISTRY,
		}),
	});

	write({
		name: "wire.ts",
		source: emitWireModule({
			catalogHints: wirePathHints({ schema: envelope, root }),
		}),
	});

	const operations: ClientOperation[] = (
		[
			[
				"previewUpdate",
				"/v1/catalogV2.preview_update",
				"PreviewUpdateCatalogResponse",
			],
			["update", "/v1/catalogV2.update", "UpdateCatalogResponse"],
			["get", "/v1/catalogV2.get", "GetCatalogResponse"],
		] as const
	).map(([name, path, responseTypeName]) => {
		const schema = responseSchema({ spec, path });
		return {
			name,
			path,
			responseTypeName,
			responseSchema: schema,
			responseHints: wirePathHints({ schema, root }),
		};
	});

	write({
		name: "client.ts",
		source: emitClientModule({
			baseUrl: serverBaseUrl({ spec }),
			operations,
			overlay: OVERLAY,
		}),
	});

	await formatWithBiome({ paths: written });
	return written;
};

if (import.meta.main) {
	const written = await generate();
	for (const path of written) {
		console.log(`generated ${path.replace(`${REPO_ROOT}/`, "")}`);
	}
}
