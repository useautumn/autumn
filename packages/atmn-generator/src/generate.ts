import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	COLLECTIONS,
	NESTED_FIXTURES,
	SINGLETONS,
	SYNCED_LISTS,
} from "./collections";
import { copyRuntime } from "./emit/copyRuntime";
import { emitApiRoutesModule } from "./emit/emitApiRoutes";
import { type ClientOperation, emitClientModule } from "./emit/emitClient";
import {
	emitBranchedCollectionModule,
	emitCollectionModule,
} from "./emit/emitCollection";
import { emitEmitModule } from "./emit/emitEmitModule";
import { emitLabelsModule } from "./emit/emitLabelsModule";
import { emitSingletonModule } from "./emit/emitSingleton";
import { emitSkillsModule } from "./emit/emitSkills";
import { emitWireModule } from "./emit/emitWire";
import {
	renamedPaths,
	type WirePathHints,
	wirePathHints,
	withRenames,
} from "./emit/freeFormPaths";
import { emitLintRulesModule } from "./lint/emitLintRules";
import { knownValues } from "./lint/rules/define";
import { LINT_REGISTRY } from "./lint/rules/registry";
import { LOCAL_URL_CHECK } from "./lint/rules/webhooks";
import { nodeRulesFromSpec } from "./lint/specRules/nodeRulesFromSpec";
import { validateRegistry } from "./lint/validateRegistry";
import { OVERLAY } from "./overlay/overlay";
import {
	catalogUpdateSchema,
	collectionItemSchema,
	loadSpec,
	PUBLIC_SPEC_PATH,
	requestBodySchema,
	responseSchema,
	serverBaseUrl,
} from "./spec/loadSpec";
import { resolveRef } from "./spec/resolveRef";
import {
	lintEnvelope,
	openEnumValues,
	syncedListItemSchema,
	syncedListsEnvelope,
} from "./spec/syncedListSchema";

const OUTPUT_DIR = join(import.meta.dir, "../../atmn/src/generated");
const REPO_ROOT = join(import.meta.dir, "../../..");

const LINT_RUNTIME_SOURCE = join(
	import.meta.dir,
	"lint/runtime/lintDocument.ts",
);

const FIXTURE_RUNTIME_SOURCE = join(
	import.meta.dir,
	"emit/runtime/emitFixture.ts",
);

/**
 * Shared rules the CLI must apply exactly as the server does. Each file imports
 * nothing, so it is copied verbatim rather than re-stated.
 */
const SHARED_RUNTIMES = [
	{ from: "shared/models/orgModels/sandboxName.ts", to: "sandboxName.ts" },
	{
		from: "shared/api/webhooks/endpoints/isLocalWebhookUrl.ts",
		to: "isLocalWebhookUrl.ts",
	},
] as const;

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

const withOpenEnumRules = ({
	spec,
	registry,
}: {
	spec: ReturnType<typeof loadSpec>;
	registry: typeof LINT_REGISTRY;
}): typeof LINT_REGISTRY =>
	Object.entries(SYNCED_LISTS).reduce((acc, [name, meta]) => {
		const entry = acc[name] ?? {};
		return {
			...acc,
			[name]: {
				...entry,
				rules: [
					...(entry.rules ?? []),
					...meta.openEnums.map((field) =>
						knownValues({
							field,
							values: openEnumValues({ spec, meta, field }),
							warning: true,
							because:
								"isn't known to this atmn version; the server will check it.",
						}),
					),
				],
			},
		};
	}, registry);

const mergeHints = (
	left: WirePathHints,
	right: WirePathHints,
): WirePathHints => ({
	recordPaths: [...left.recordPaths, ...right.recordPaths],
	frozenPaths: [...left.frozenPaths, ...right.frozenPaths],
	renamedPaths: { ...left.renamedPaths, ...right.renamedPaths },
});

export const generate = async (): Promise<string[]> => {
	const spec = loadSpec();
	const root = spec as never;
	const envelope = catalogUpdateSchema({ spec });
	mkdirSync(OUTPUT_DIR, { recursive: true });

	const written: string[] = [];
	copyRuntime({
		from: join(import.meta.dir, "emit/runtime/mappingAssignments.ts"),
		to: join(OUTPUT_DIR, "mappingAssignments.ts"),
		sourceLabel:
			"packages/atmn-generator/src/emit/runtime/mappingAssignments.ts",
	});
	written.push(join(OUTPUT_DIR, "mappingAssignments.ts"));
	const write = ({ name, source }: { name: string; source: string }) => {
		const path = join(OUTPUT_DIR, name);
		writeFileSync(path, source, "utf8");
		written.push(path);
	};

	for (const [name, meta] of Object.entries(COLLECTIONS)) {
		const schema = collectionItemSchema({ spec, collection: name });
		write({
			name: `${name}.ts`,
			source: meta.branches
				? emitBranchedCollectionModule({
						name,
						typeName: meta.typeName,
						schema,
						overlay: OVERLAY,
						branches: meta.branches,
					})
				: emitCollectionModule({
						name,
						builder: meta.builder,
						typeName: meta.typeName,
						schema,
						overlay: OVERLAY,
					}),
		});
	}

	for (const [name, meta] of Object.entries(NESTED_FIXTURES)) {
		const parentItem = collectionItemSchema({ spec, collection: meta.parent });
		const itemSchema = parentItem.properties?.[meta.path]?.items;
		if (!itemSchema)
			throw new Error(
				`\`${meta.parent}.${meta.path}\` is not an array of objects on the catalogV2.update body.`,
			);
		write({
			name: `${name}.ts`,
			source: emitCollectionModule({
				name: meta.parent,
				builder: meta.builder,
				typeName: meta.typeName,
				schema: itemSchema,
				overlay: OVERLAY,
				path: meta.path,
			}),
		});
	}

	for (const [name, meta] of Object.entries(SYNCED_LISTS)) {
		write({
			name: `${name}.ts`,
			source: emitCollectionModule({
				name,
				builder: meta.builder,
				typeName: meta.typeName,
				schema: syncedListItemSchema({ spec, meta }),
				overlay: OVERLAY,
				describe: meta.describe,
			}),
		});
	}

	for (const { from, to } of SHARED_RUNTIMES) {
		copyRuntime({
			from: join(REPO_ROOT, from),
			to: join(OUTPUT_DIR, to),
			sourceLabel: from,
		});
		written.push(join(OUTPUT_DIR, to));
	}

	for (const [name, meta] of Object.entries(SINGLETONS)) {
		const body = requestBodySchema({ spec, path: meta.operationPath });
		const schema = body.properties?.[meta.wireKey];
		if (!schema)
			throw new Error(
				`\`${meta.wireKey}\` is not on the ${meta.operationPath} body.`,
			);
		write({
			name: `${name}.ts`,
			source: emitSingletonModule({
				name,
				typeName: meta.typeName,
				schema: resolveRef({ schema, root }) ?? schema,
				overlay: OVERLAY,
			}),
		});
	}

	const lintRuntimePath = join(OUTPUT_DIR, "lintRuntime.ts");
	copyRuntime({
		from: LINT_RUNTIME_SOURCE,
		to: lintRuntimePath,
		sourceLabel: "packages/atmn-generator/src/lint/runtime/lintDocument.ts",
	});
	written.push(lintRuntimePath);

	const emitRuntimePath = join(OUTPUT_DIR, "emitRuntime.ts");
	copyRuntime({
		from: FIXTURE_RUNTIME_SOURCE,
		to: emitRuntimePath,
		sourceLabel: "packages/atmn-generator/src/emit/runtime/emitFixture.ts",
	});
	written.push(emitRuntimePath);

	write({
		name: "emit.ts",
		source: emitEmitModule({
			spec,
			overlay: OVERLAY,
			collections: COLLECTIONS,
			nested: NESTED_FIXTURES,
			singletons: SINGLETONS,
			syncedLists: SYNCED_LISTS,
		}),
	});

	// A typo in a rule's path or field would otherwise ship as a rule that
	// never fires.
	const listsEnvelope = syncedListsEnvelope({ spec, lists: SYNCED_LISTS });
	// An open enum's known names come from the spec, so they can't go stale.
	const registry = withOpenEnumRules({ spec, registry: LINT_REGISTRY });
	validateRegistry({
		registry,
		schema: lintEnvelope({ spec, lists: SYNCED_LISTS }),
		root,
		overlay: OVERLAY,
	});
	// Singletons are linted under their config key, so the spec's constraints
	// on them reach the document walk like any collection's.
	const singletonEnvelope = {
		type: "object",
		properties: Object.fromEntries(
			Object.entries(SINGLETONS).map(([name, meta]) => [
				name,
				requestBodySchema({ spec, path: meta.operationPath }).properties?.[
					meta.wireKey
				] ?? {},
			]),
		),
	};
	write({
		name: "lintRules.ts",
		source: emitLintRulesModule({
			specRules: {
				...nodeRulesFromSpec({ schema: envelope, root, overlay: OVERLAY }),
				...nodeRulesFromSpec({
					schema: singletonEnvelope,
					root,
					overlay: OVERLAY,
				}),
				...nodeRulesFromSpec({ schema: listsEnvelope, root, overlay: OVERLAY }),
			},
			registry,
		}),
	});
	write({
		name: "labels.ts",
		source: emitLabelsModule(),
	});

	write({
		name: "wire.ts",
		source: emitWireModule({
			catalogHints: withRenames({
				hints: mergeHints(
					wirePathHints({ schema: envelope, root }),
					wirePathHints({ schema: listsEnvelope, root }),
				),
				renames: renamedPaths({
					overlay: OVERLAY,
					roots: Object.fromEntries(
						[...Object.keys(COLLECTIONS), ...Object.keys(SINGLETONS)].map(
							(name) => [name, name],
						),
					),
				}),
			}),
			collections: COLLECTIONS,
			singletons: SINGLETONS,
			syncedLists: SYNCED_LISTS,
			checks: [{ name: LOCAL_URL_CHECK, from: "./isLocalWebhookUrl.js" }],
		}),
	});

	// `requestTypeName` marks an operation whose body is its own typed object;
	// the catalog operations send the wire document `atmn()` already built.
	const operations: ClientOperation[] = (
		[
			{
				name: "diff",
				path: "/v1/catalogV2.diff",
				responseTypeName: "DiffCatalogResponse",
			},
			{
				name: "previewUpdate",
				path: "/v1/catalogV2.preview_update",
				responseTypeName: "PreviewUpdateCatalogResponse",
			},
			{
				name: "update",
				path: "/v1/catalogV2.update",
				responseTypeName: "UpdateCatalogResponse",
			},
			{
				name: "get",
				path: "/v1/catalogV2.get",
				responseTypeName: "GetCatalogResponse",
			},
			// Singleton operations take the body `splitWire` cut from the document.
			{
				name: "previewUpdateOrganization",
				path: "/v1/organization.preview_update",
				responseTypeName: "PreviewUpdateOrganizationResponse",
			},
			{
				name: "updateOrganization",
				path: "/v1/organization.update",
				responseTypeName: "UpdateOrganizationResponse",
			},
			{
				name: "createSandbox",
				path: "/v1/sandboxes.create",
				responseTypeName: "CreateSandboxResponse",
				requestTypeName: "CreateSandboxParams",
			},
			{
				name: "listSandboxes",
				path: "/v1/sandboxes.list",
				responseTypeName: "ListSandboxesResponse",
				requestTypeName: "ListSandboxesParams",
			},
			{
				name: "deleteSandbox",
				path: "/v1/sandboxes.delete",
				responseTypeName: "DeleteSandboxResponse",
				requestTypeName: "DeleteSandboxParams",
			},
			{
				name: "createSandboxKey",
				path: "/v1/sandboxes.create_key",
				responseTypeName: "CreateSandboxKeyResponse",
				requestTypeName: "CreateSandboxKeyParams",
			},
			{
				name: "resetSandbox",
				path: "/v1/sandboxes.reset",
				responseTypeName: "ResetSandboxResponse",
				requestTypeName: "ResetSandboxParams",
			},
			// Synced-list operations take the entries push resolved for the target env.
			{
				name: "listWebhooks",
				path: "/v1/webhooks.list",
				responseTypeName: "ListWebhooksResponse",
				requestTypeName: "ListWebhooksParams",
			},
			{
				name: "previewSyncWebhooks",
				path: "/v1/webhooks.preview_sync",
				responseTypeName: "PreviewSyncWebhooksResponse",
				requestTypeName: "SyncWebhooksParams",
			},
			{
				name: "syncWebhooks",
				path: "/v1/webhooks.sync",
				responseTypeName: "SyncWebhooksResponse",
				requestTypeName: "SyncWebhooksParams",
			},
		] as const
	).map(({ name, path, responseTypeName, ...rest }) => {
		const schema = responseSchema({ spec, path });
		const requestTypeName =
			"requestTypeName" in rest ? rest.requestTypeName : undefined;
		const request =
			requestTypeName === undefined
				? undefined
				: requestBodySchema({ spec, path });
		return {
			name,
			path,
			responseTypeName,
			// Renames are a fixture-side concept: a response is typed as the spec
			// names it, so it is recased and nothing more.
			responseSchema: schema,
			responseHints: wirePathHints({ schema, root }),
			...(request === undefined || requestTypeName === undefined
				? {}
				: {
						request: {
							typeName: requestTypeName,
							schema: request,
							hints: wirePathHints({ schema: request, root }),
						},
					}),
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

	write({ name: "skills.ts", source: await emitSkillsModule() });

	// `atmn api` mirrors the published surface: the public spec, never the
	// internal one, so a field the docs hide cannot leak through a flag.
	write({
		name: "apiRoutes.ts",
		source: emitApiRoutesModule({ spec: loadSpec({ path: PUBLIC_SPEC_PATH }) }),
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
