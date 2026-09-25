import { loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import type { AutumnClient } from "../generated/client";
import type { LintIssue } from "../generated/lintRuntime";
import { splitWire } from "../generated/wire";
import { resolveProject } from "../project/resolveProject";
import {
	type CatalogPreview,
	previewIsEmpty,
	renderMigrationLinks,
	renderPreview,
	type SettingsPreview,
	settingsHaveWork,
} from "../render/renderPreview";
import {
	backfillInternalIds,
	identityRowsFromApplied,
} from "./push/backfillInternalIds";
import {
	deprecatedUsesIn,
	renderDeprecatedUses,
} from "./push/deprecatedFields";
import { PushLanesError, settleLanes } from "./push/pushLanesError";
import { withSettingsScopeHint } from "./sandbox/withSandboxScopeHint";
import { applyWebhooks } from "./webhooks/applyWebhooks";
import { previewWebhooks, type WebhooksLane } from "./webhooks/previewWebhooks";
import type { WebhookEnv } from "./webhooks/types/webhookEnv";

export type PushResult = {
	configPath: string;
	preview: CatalogPreview;
	/** Absent on a dry run, or when the preview showed nothing to do. */
	applied?: unknown;
	migrationIds: string[];
};

/** The settings lane of one push: absent when the config states no `settings`. */
const previewSettings = async ({
	client,
	body,
}: {
	client: AutumnClient;
	body: Record<string, unknown> | undefined;
}): Promise<SettingsPreview | undefined> => {
	if (body === undefined) return undefined;
	try {
		return (await client.previewUpdateOrganization(body)) as SettingsPreview;
	} catch (error) {
		throw withSettingsScopeHint({ error });
	}
};

export type PushOptions = {
	client: AutumnClient;
	cwd?: string;
	/** `-c`: the config file or its folder; found from cwd or the root marker otherwise. */
	configPath?: string;
	dryRun?: boolean;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	migrationLinkBase?: string;
	/** The target env for the webhook lane; resolved only when the config states webhooks. */
	webhookEnv?: () => Promise<WebhookEnv>;
};

type RewardBody = { id?: string; internal_id?: string };

type WireLike = {
	features?: { feature_id?: string; internal_id?: string }[];
	plans?: { plan_id?: string; internal_id?: string }[];
	rewards?: { coupon?: RewardBody; feature_grant?: RewardBody }[];
	referral_programs?: { id?: string; internal_id?: string }[];
};

const fixtureCount = (count: number): string =>
	`${count} fixture${count === 1 ? "" : "s"}`;

/** One count per field: the two sets overlap only sometimes, and a fixture
 * that took just one of them must not read as having taken both. */
export const backfillSummary = ({
	backfilled,
	slugged,
}: {
	backfilled: string[];
	slugged: string[];
}): string =>
	`Wrote ${[
		...(backfilled.length > 0
			? [`internalId into ${fixtureCount(backfilled.length)}`]
			: []),
		...(slugged.length > 0
			? [`versionSlug into ${fixtureCount(slugged.length)}`]
			: []),
	].join(" and ")}.\n`;

/**
 * A rename the config cannot express shows up as a delete beside a create
 * with no internalId. The push may be right, so this is a note, not a refusal.
 */
export const possibleRenameHint = ({
	preview,
	wire,
}: {
	preview: CatalogPreview;
	wire: WireLike;
}): string | null => {
	const lanes: {
		rows: {
			action?: string;
			featureId?: string;
			planId?: string;
			id?: string;
		}[];
		idOf: (row: {
			featureId?: string;
			planId?: string;
			id?: string;
		}) => string | undefined;
		stated: Set<string>;
		noun: string;
	}[] = [
		{
			rows: preview.features ?? [],
			idOf: (row) => row.featureId,
			stated: new Set(
				(wire.features ?? [])
					.filter((row) => row.internal_id === undefined)
					.map((row) => row.feature_id ?? ""),
			),
			noun: "feature",
		},
		{
			rows: preview.plans ?? [],
			idOf: (row) => row.planId,
			stated: new Set(
				(wire.plans ?? [])
					.filter((row) => row.internal_id === undefined)
					.map((row) => row.plan_id ?? ""),
			),
			noun: "plan",
		},
		{
			rows: preview.rewards ?? [],
			idOf: (row) => row.id,
			stated: new Set(
				(wire.rewards ?? [])
					.map((row) => row.coupon ?? row.feature_grant)
					.filter(
						(body) => body !== undefined && body.internal_id === undefined,
					)
					.map((body) => body?.id ?? ""),
			),
			noun: "reward",
		},
		{
			rows: preview.referralPrograms ?? [],
			idOf: (row) => row.id,
			stated: new Set(
				(wire.referral_programs ?? [])
					.filter((row) => row.internal_id === undefined)
					.map((row) => row.id ?? ""),
			),
			noun: "referral program",
		},
	];
	const notes: string[] = [];
	for (const lane of lanes) {
		const deleted = lane.rows
			.filter((row) => row.action === "delete")
			.map((row) => lane.idOf(row) ?? "?");
		const createdWithoutId = lane.rows
			.filter((row) => row.action === "create")
			.map((row) => lane.idOf(row) ?? "?")
			.filter((id) => lane.stated.has(id));
		if (deleted.length === 0 || createdWithoutId.length === 0) continue;
		notes.push(
			`Note: this push removes ${lane.noun} ${deleted.join(", ")} and creates ${createdWithoutId.join(", ")} without an internalId. If that is a rename, pull first so the fixture carries its id, or it will be treated as delete + create.`,
		);
	}
	return notes.length > 0 ? notes.join("\n") : null;
};

/** The directories a config may live in, nearest first. */
export const configSearchDirs = ({
	cwd,
	configPath,
}: {
	cwd: string;
	configPath?: string;
}): string[] => {
	const project = resolveProject({ cwd, configFlag: configPath });
	return [...new Set([project.configDir, cwd, ...project.envDirs])];
};

/** A lint warning never refuses the config; it is printed above the preview. */
const renderLintWarnings = ({ warnings }: { warnings: LintIssue[] }): string =>
	warnings
		.map((warning) => `⚠ ${warning.path}\n  ${warning.message}`)
		.join("\n");

/**
 * Settings, then the catalog: a flag like multi_currency changes what the
 * catalog accepts, so after a settings write the catalog is previewed again
 * against the settings as they now are, and applied only if work remains.
 */
const applySettingsThenCatalog = async ({
	client,
	settingsBody,
	settings,
	catalogPreview,
	wire,
	configPath,
	write,
	migrationLinkBase,
}: {
	client: AutumnClient;
	settingsBody: Record<string, unknown> | undefined;
	settings: SettingsPreview | undefined;
	catalogPreview: CatalogPreview;
	wire: Record<string, unknown>;
	configPath: string;
	write: (text: string) => void;
	migrationLinkBase?: string;
}): Promise<{ applied?: unknown; migrationIds: string[] }> => {
	let preview = catalogPreview;
	if (settingsBody !== undefined && settingsHaveWork({ settings })) {
		try {
			await client.updateOrganization(settingsBody);
		} catch (error) {
			throw withSettingsScopeHint({ error });
		}
		write("\nApplied settings.\n");
		preview = (await client.previewUpdate(wire)) as CatalogPreview;
	}
	if (previewIsEmpty({ preview })) return { migrationIds: [] };

	const applied = (await client.update(wire)) as {
		migrations?: { id?: string }[];
		results?: Record<string, unknown>;
	};

	const migrationIds = (applied.migrations ?? [])
		.map((migration) => migration.id)
		.filter((id): id is string => typeof id === "string");

	write("\nApplied.\n");
	if (migrationIds.length > 0) {
		write(
			`${renderMigrationLinks({
				migrations: migrationIds.map((id) => ({ id })),
				migrationLinkBase,
			})}\n\n`,
		);
	}

	// The update response has no variant edges; when the config states any,
	// the catalog's plan rows (with each variant's resolved plan) fill them in.
	const statesVariants = (
		(wire as { plans?: { variants?: unknown[] }[] }).plans ?? []
	).some((row) => Array.isArray(row.variants) && row.variants.length > 0);
	const rows = identityRowsFromApplied({ applied });
	if (statesVariants) {
		const catalog = (await client.get({
			include_versions: true,
		})) as unknown as {
			plans?: unknown;
		};
		if (Array.isArray(catalog.plans))
			rows.plans = catalog.plans as typeof rows.plans;
	}
	const { backfilled, slugged } = backfillInternalIds({ rows, configPath });
	if (backfilled.length > 0 || slugged.length > 0) {
		write(backfillSummary({ backfilled, slugged }));
	}
	return { applied, migrationIds };
};

/**
 * Preview, then apply. The CLI decides nothing here — it sends the same
 * document twice and renders what comes back, which is why a clean preview is
 * a real guarantee rather than a guess.
 *
 * Settings, catalog and webhooks preview together and render as one; every
 * failing lane is reported at once. Applying runs settings → catalog as one
 * chain and webhooks → secrets beside it.
 */
export const runPush = async ({
	client,
	cwd = process.cwd(),
	configPath: configFlag,
	dryRun = false,
	write = (text) => process.stdout.write(text),
	migrationLinkBase,
	webhookEnv,
}: PushOptions): Promise<PushResult> => {
	const project = resolveProject({ cwd, configFlag });
	const dirs = configSearchDirs({ cwd, configPath: configFlag });
	loadEnvFiles({ dirs: project.envDirs });

	const { path: configPath, wire: document } = await loadConfig({
		dirs,
		...(project.configPath === null ? {} : { configPath: project.configPath }),
	});
	// One document, three destinations: the catalog, each singleton and each synced list.
	const { catalog: wire, singletons, lists, warnings } = splitWire(document);
	if (warnings.length > 0) write(`${renderLintWarnings({ warnings })}\n\n`);

	const deprecated = deprecatedUsesIn({ wire });
	if (deprecated.length > 0)
		write(`${renderDeprecatedUses({ uses: deprecated })}\n\n`);

	const settingsBody = singletons.settings;
	const previews = await settleLanes<{
		settings: SettingsPreview | undefined;
		catalog: CatalogPreview;
		webhooks: WebhooksLane | undefined;
	}>({
		settings: previewSettings({ client, body: settingsBody }),
		catalog: client.previewUpdate(wire) as Promise<CatalogPreview>,
		webhooks: previewWebhooks({
			client,
			rows: lists.webhooks,
			webhookEnv,
		}),
	});
	if (previews.failures.length > 0)
		throw new PushLanesError({ stage: "preview", failures: previews.failures });
	const { settings, webhooks } = previews.values;
	const catalogPreview = previews.values.catalog ?? {};

	const preview: CatalogPreview = {
		...catalogPreview,
		settings,
		...(webhooks === undefined ? {} : { webhooks: webhooks.preview }),
	};
	write(`${renderPreview({ preview, migrationLinkBase })}\n`);

	const renameHint = possibleRenameHint({ preview, wire: wire as WireLike });
	if (renameHint !== null) write(`${renameHint}\n\n`);

	if (dryRun || previewIsEmpty({ preview }))
		return { configPath, preview, migrationIds: [] };

	const applied = await settleLanes<{
		catalog: { applied?: unknown; migrationIds: string[] };
		webhooks: unknown;
	}>({
		catalog: applySettingsThenCatalog({
			client,
			settingsBody,
			settings,
			catalogPreview,
			wire,
			configPath,
			write,
			migrationLinkBase,
		}),
		webhooks: applyWebhooks({
			client,
			lane: webhooks,
			envDirs: project.envDirs,
			cwd,
			write,
		}),
	});
	if (applied.failures.length > 0)
		throw new PushLanesError({ stage: "apply", failures: applied.failures });

	return {
		configPath,
		preview,
		applied: applied.values.catalog?.applied,
		migrationIds: applied.values.catalog?.migrationIds ?? [],
	};
};
