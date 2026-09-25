import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { ConfigNotFoundError, loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import { AutumnApiError, type AutumnClient } from "../generated/client";
import { COLLECTIONS, NESTED_FIXTURES, SINGLETONS } from "../generated/emit";
import { splitWire, type WireDocument } from "../generated/wire";
import { chooseConfigDir } from "../project/chooseConfigDir";
import { resolveProject } from "../project/resolveProject";
import { writeRootMarker } from "../project/rootMarker";
import { createPrompter, done, type Prompter } from "../prompt/prompt";
import type { SettingsPreview } from "../render/renderPreview";
import { applyMappings } from "./pull/applyMappings";
import { applyPreview, type PreviewEntry } from "./pull/applyPreview";
import { applySettingsPreview } from "./pull/applySettingsPreview";
import { listSourceFiles } from "./pull/listSourceFiles";
import {
	pruneUnpulledPlanIds,
	pulledPlanIds,
} from "./pull/pruneUnpulledPlanIds";
import { rewriteConfig } from "./pull/rewriteConfig";
import {
	type ConfigImports,
	packageImports,
	scaffoldConfig,
} from "./pull/scaffoldConfig";
import { applyWebhooksPull } from "./pull/webhooks/applyWebhooksPull";
import type { StatedWebhook } from "./pull/webhooks/types";
import { configSearchDirs } from "./push";
import {
	backfillInternalIds,
	identityRowsFromCatalog,
} from "./push/backfillInternalIds";
import type { WebhookEnv } from "./webhooks/types/webhookEnv";

export type PullResult = {
	configPath: string;
	appended: string[];
	replaced: string[];
	deleted: string[];
};

export type PullOptions = {
	client: AutumnClient;
	cwd?: string;
	/** `-c`: the config file or its folder; found from cwd or the root marker otherwise. */
	configPath?: string;
	/** Keep processor mappings (Stripe product/meter ids) in pulled fixtures. */
	includeMappings?: boolean;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	/** Module specifiers a scaffolded config imports from; the package by default. */
	imports?: ConfigImports;
	/**
	 * Rewrite the config and its collection files from the server, as if from
	 * an empty directory. Files that do not import the package are left alone.
	 * The way out when the file describes a different org than the key targets.
	 */
	overwrite?: boolean;
	/** Confirm replacing the local config when overwrite is set. */
	yes?: boolean;
	/** Asks where a first pull should put the config; headless by default. */
	prompter?: Prompter;
	/** The target env for the webhook lane; without it webhooks are not pulled. */
	webhookEnv?: () => Promise<WebhookEnv>;
};

const OVERWRITE_HINT =
	"Your config no longer matches this org's catalog. To replace it with the server's catalog: atmn pull --overwrite";

/** Only a rejected catalog diff earns the overwrite hint. */
const diffOrExplain = async ({
	client,
	wire,
}: {
	client: AutumnClient;
	wire: WireDocument;
}) => {
	try {
		return await client.diff(wire);
	} catch (error) {
		if (error instanceof AutumnApiError && error.status === 400) {
			throw new Error(`${error.message}\n  ${OVERWRITE_HINT}`);
		}
		throw error;
	}
};

/** No config means a first pull: scaffold one at `cwd`, then pull into it. */
const loadOrScaffold = async ({
	dirs,
	cwd,
	configPath,
	existingConfigPath,
	imports,
	overwrite,
	write,
}: {
	dirs: string[];
	cwd: string;
	/** `-c`: an exact file; scaffolded there when missing. */
	configPath?: string;
	/** The config on disk, when there is one. */
	existingConfigPath: string | null;
	imports: ConfigImports | undefined;
	overwrite: boolean;
	write: (text: string) => void;
}) => {
	const scaffold = () => {
		const scaffolded = scaffoldConfig({
			directory: cwd,
			...(configPath === undefined ? {} : { configPath }),
			imports,
		});
		write(`Scaffolded ${scaffolded}\n`);
		return loadConfig({ dirs: [cwd], configPath: scaffolded });
	};

	// Overwrite never deletes: with no config it is a first pull, otherwise the
	// config and the collection files it owns are rewritten as a fresh shell.
	if (overwrite && existingConfigPath === null) return scaffold();
	if (overwrite && existingConfigPath !== null) {
		const { rewritten, kept } = rewriteConfig({
			configPath: existingConfigPath,
			imports: imports ?? packageImports(),
		});
		write(`Rewrote ${rewritten.map((file) => basename(file)).join(", ")}\n`);
		if (kept.length > 0)
			write(
				`Left alone (not atmn files): ${kept.map((file) => basename(file)).join(", ")}\n`,
			);
		return loadConfig({ dirs: [cwd], configPath: existingConfigPath });
	}
	try {
		return await loadConfig({
			dirs,
			...(configPath === undefined ? {} : { configPath }),
		});
	} catch (error) {
		if (!(error instanceof ConfigNotFoundError)) throw error;
		return scaffold();
	}
};

/** Preview rows plus the sibling versions nested under them: a sibling has no
 * action of its own, so it is walked as an update and acted on only when its
 * active flag contradicts what the config states. */
const entriesOf = (value: unknown): PreviewEntry[] => {
	if (!Array.isArray(value)) return [];
	const rows = value as PreviewEntry[];
	return rows.flatMap((row) => {
		const siblings = Array.isArray(row.siblingVersions)
			? (row.siblingVersions as PreviewEntry[])
			: [];
		return [
			row,
			...siblings.map((sibling) => ({
				...sibling,
				action: "update",
				siblingOf: row.planId,
			})),
		];
	});
};

const rowsOf = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const featureTypesOf = ({
	rows,
}: {
	rows: Record<string, unknown>[];
}): Readonly<Record<string, string>> => {
	const featureTypes: Record<string, string> = {};
	for (const row of rows) {
		if (typeof row.id === "string" && typeof row.type === "string")
			featureTypes[row.id] = row.type;
	}
	return featureTypes;
};

type VariantEdge = Record<string, unknown> & {
	plan?: { internalId?: unknown; versionSlug?: unknown } | null;
};

/**
 * A variant edge names its identity on the resolved plan, which the fixture
 * never carries; hoisted onto the edge, the written entry always states its
 * stable id and slug, so no pulled variant is left version-less.
 */
const withVariantIdentity = (
	rows: Record<string, unknown>[],
): Record<string, unknown>[] =>
	rows.map((row) => {
		if (!Array.isArray(row.variants)) return row;
		return {
			...row,
			variants: (row.variants as VariantEdge[]).map((edge) => {
				const { internalId, versionSlug, ...rest } = edge;
				const stableId = internalId ?? edge.plan?.internalId;
				const slug = versionSlug ?? edge.plan?.versionSlug;
				return {
					...(typeof stableId === "string" ? { internalId: stableId } : {}),
					...rest,
					...(typeof slug === "string" ? { versionSlug: slug } : {}),
				};
			}),
		};
	});

/**
 * Pull rides preview: the server's diff drives every edit, and the CLI never
 * diffs anything itself. Config sources are held in memory and only files
 * whose text changed go back to disk.
 */
export const runPull = async ({
	client,
	cwd = process.cwd(),
	configPath: configFlag,
	includeMappings = false,
	write = (text) => process.stdout.write(text),
	imports,
	overwrite = false,
	yes = false,
	prompter = createPrompter({ interactive: false, write }),
	webhookEnv,
}: PullOptions): Promise<PullResult> => {
	const project = resolveProject({ cwd, configFlag });
	if (overwrite && !yes) {
		write(
			"This rewrites autumn.config.ts and the features.ts, plans.ts and rewards.ts beside it from your org's catalog. Other files are left alone. Re-run with --yes to overwrite.\n",
		);
		return {
			configPath:
				project.configPath ?? join(project.configDir, "autumn.config.ts"),
			appended: [],
			replaced: [],
			deleted: [],
		};
	}
	const dirs = configSearchDirs({ cwd, configPath: configFlag });
	loadEnvFiles({ dirs: project.envDirs });

	// Nothing states where the config lives: ask, and never scaffold into cwd
	// unasked. A folder other than cwd gets the root marker so later commands
	// find it from anywhere in the repo.
	let scaffoldDir = project.configDir;
	let scaffoldPath = project.configPath ?? undefined;
	if (project.configPath === null) {
		const chosen = await chooseConfigDir({ cwd, prompter });
		scaffoldDir = chosen.configDir;
		scaffoldPath = join(scaffoldDir, "autumn.config.ts");
		if (
			scaffoldDir !== cwd &&
			writeRootMarker({ repoRoot: chosen.repoRoot, configPath: scaffoldPath })
		)
			prompter.write(
				`${done("Recorded in package.json so atmn finds it from anywhere")}\n`,
			);
	}

	const { path: configPath, wire: document } = await loadOrScaffold({
		dirs,
		cwd: scaffoldDir,
		...(scaffoldPath === undefined ? {} : { configPath: scaffoldPath }),
		existingConfigPath: project.configPath,
		imports,
		overwrite,
		write,
	});
	const { catalog: wire, singletons, lists } = splitWire(document);

	const [preview, catalog, settingsPreview, webhooks] = await Promise.all([
		diffOrExplain({ client, wire }),
		// Every version: each is a row in plans, with `active` on it.
		client.get({ include_versions: true }),
		// Always asked, even with no `settings` stated: a non-default flag the
		// config omits is exactly what a first pull should write.
		client.previewUpdateOrganization(
			singletons.settings ?? { config: {} },
		) as Promise<SettingsPreview>,
		// Always listed, like settings: a webhook the config never named is pulled in.
		webhookEnv === undefined
			? undefined
			: Promise.all([webhookEnv(), client.listWebhooks({})]),
	]);

	const files = new Map<string, string>();
	files.set(configPath, readFileSync(configPath, "utf8"));
	for (const file of listSourceFiles({ directory: dirname(configPath) })) {
		// The config is already in the map and is always tried first.
		if (file === configPath || files.has(file)) continue;
		files.set(file, readFileSync(file, "utf8"));
	}
	const originals = new Map(files);

	const appended: string[] = [];
	const replaced: string[] = [];
	const deleted: string[] = [];
	const lines: string[] = [];
	const unlocated: { collection: string; id: string; action: string }[] = [];
	const previewRows = preview as unknown as Record<string, unknown>;
	const catalogRows = catalog as unknown as Record<string, unknown>;
	const featureTypes = featureTypesOf({ rows: rowsOf(catalogRows.features) });
	// A reward may name an archived plan; the pull never writes one, and a
	// config cannot name a plan it does not declare.
	const pulled = pulledPlanIds({ plans: rowsOf(catalogRows.plans) });
	const rewards = pruneUnpulledPlanIds({
		rows: rowsOf(catalogRows.rewards),
		pulled,
		kind: "rewards",
	});
	const referralPrograms = pruneUnpulledPlanIds({
		rows: rowsOf(catalogRows.referralPrograms),
		pulled,
		kind: "referralPrograms",
	});
	const pulledRows: Record<string, unknown> = {
		...catalogRows,
		rewards: rewards.rows,
		referralPrograms: referralPrograms.rows,
	};
	const nestedBuilders = Object.fromEntries(
		Object.values(NESTED_FIXTURES).map(({ path, builder }) => [path, builder]),
	);

	for (const [collection, spec] of Object.entries(COLLECTIONS)) {
		// Versions share an id; until internal_id lands, pull cannot address them.
		if (!spec.pull) continue;
		const applied = applyPreview({
			collection,
			spec,
			entries: entriesOf(previewRows[collection]),
			catalogRows: withVariantIdentity(rowsOf(pulledRows[collection])),
			configPath,
			files,
			includeMappings,
			featureTypes,
			nestedBuilders,
		});
		appended.push(...applied.appended);
		replaced.push(...applied.replaced);
		deleted.push(...applied.deleted);
		lines.push(...applied.lines);
		unlocated.push(
			...applied.unlocated.map((entry) => ({ collection, ...entry })),
		);
	}

	for (const [singleton, spec] of Object.entries(SINGLETONS)) {
		const applied = applySettingsPreview({
			singleton,
			spec,
			changes: settingsPreview.config?.changes ?? [],
			stated: singletons[singleton]?.[spec.wireKey] as
				| Record<string, unknown>
				| undefined,
			configPath,
			files,
		});
		lines.push(...applied.lines);
		unlocated.push(
			...applied.unlocated.map((key) => ({
				collection: singleton,
				id: key,
				action: `set by hand: \`${singleton}\` is not an object literal`,
			})),
		);
	}

	const webhookWarnings: string[] = [];
	if (webhooks !== undefined) {
		const [env, { list }] = webhooks;
		const applied = applyWebhooksPull({
			pull: { configPath, files },
			remote: list,
			stated: lists.webhooks as StatedWebhook[] | undefined,
			envKey: env.key,
		});
		lines.push(...applied.lines);
		webhookWarnings.push(...applied.warnings);
		unlocated.push(
			...applied.unlocated.map((entry) => ({
				collection: "webhooks",
				...entry,
			})),
		);
	}

	if (includeMappings) {
		const managedCatalog = Object.fromEntries(
			Object.entries(COLLECTIONS)
				.filter(
					([, spec]) =>
						spec.wireKey !== undefined && wire[spec.wireKey] !== undefined,
				)
				.map(([collection]) => [collection, catalogRows[collection]]),
		);
		const mapped = applyMappings({
			catalog: managedCatalog,
			configPath,
			files,
		});
		unlocated.push(...mapped.unlocated);
		for (const id of mapped.replaced) {
			if (!replaced.includes(id) && !appended.includes(id)) replaced.push(id);
			lines.push(`↳ wrote processor mappings into ${id}`);
		}
	}

	lines.push(...rewards.lines, ...referralPrograms.lines);

	// A fixture that is not a plain literal cannot be edited in place; saying
	// so before writing anything beats a half-applied pull.
	if (unlocated.length > 0) throw new UnlocatableFixturesError({ unlocated });

	for (const [file, source] of files) {
		if (source === originals.get(file)) continue;
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, source, "utf8");
		if (!originals.has(file)) {
			const keep = join(dirname(file), ".gitkeep");
			if (existsSync(keep)) unlinkSync(keep);
		}
	}

	// Fixtures the catalog already knows get their stable id and slug, even
	// when nothing else about them changed: no row is left slug-less.
	const { backfilled, slugged } = backfillInternalIds({
		rows: identityRowsFromCatalog({ catalog: catalogRows }),
		configPath,
	});
	if (backfilled.length > 0)
		lines.push(
			`↳ wrote internalId into ${backfilled.length} fixture${backfilled.length === 1 ? "" : "s"}`,
		);
	if (slugged.length > 0)
		lines.push(
			`↳ wrote versionSlug into ${slugged.length} fixture${slugged.length === 1 ? "" : "s"}`,
		);

	if (webhookWarnings.length > 0) write(`${webhookWarnings.join("\n\n")}\n\n`);
	write(
		lines.length === 0
			? "Nothing to pull.\n"
			: `${lines.join("\n")}\nPulled.\n`,
	);

	return { configPath, appended, replaced, deleted };
};

export class UnlocatableFixturesError extends Error {
	constructor({
		unlocated,
	}: {
		unlocated: { collection: string; id: string; action: string }[];
	}) {
		super(
			[
				`atmn pull cannot edit ${unlocated.length} fixture${unlocated.length === 1 ? "" : "s"} — each must be a plain literal (no spreads, helpers or .map()):`,
				...unlocated.map(
					({ collection, id, action }) =>
						`  ${collection} ${JSON.stringify(id)}: ${action}`,
				),
			].join("\n"),
		);
		this.name = "UnlocatableFixturesError";
	}
}
