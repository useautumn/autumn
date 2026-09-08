import { join } from "node:path";
import { loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import type { AutumnClient } from "../generated/client";
import { splitWire } from "../generated/wire";
import {
	type CatalogPreview,
	previewIsEmpty,
	renderMigrationLinks,
	renderPreview,
	type SettingsPreview,
	settingsHaveWork,
} from "../render/renderPreview";
import { findRepoLayout } from "../repo/findRepoRoot";
import {
	backfillInternalIds,
	identityRowsFromApplied,
} from "./push/backfillInternalIds";
import {
	deprecatedUsesIn,
	renderDeprecatedUses,
} from "./push/deprecatedFields";
import { withSettingsScopeHint } from "./sandbox/withSandboxScopeHint";

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
	dryRun?: boolean;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	migrationLinkBase?: string;
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
export const configSearchDirs = ({ cwd }: { cwd: string }): string[] => {
	const { packageRoot, repoRoot } = findRepoLayout({ cwd });
	return [...new Set([cwd, join(cwd, "atmn"), packageRoot, repoRoot])];
};

/**
 * Preview, then apply. The CLI decides nothing here — it sends the same
 * document twice and renders what comes back, which is why a clean preview is
 * a real guarantee rather than a guess.
 */
export const runPush = async ({
	client,
	cwd = process.cwd(),
	dryRun = false,
	write = (text) => process.stdout.write(text),
	migrationLinkBase,
}: PushOptions): Promise<PushResult> => {
	const dirs = configSearchDirs({ cwd });
	loadEnvFiles({ dirs });

	const { path: configPath, wire: document } = await loadConfig({ dirs });
	// One document, two operations: the catalog and each singleton go their own way.
	const { catalog: wire, singletons } = splitWire(document);

	const deprecated = deprecatedUsesIn({ wire });
	if (deprecated.length > 0)
		write(`${renderDeprecatedUses({ uses: deprecated })}\n\n`);

	// Settings go first, on their own: a flag like multi_currency changes what
	// the catalog accepts, so the catalog is previewed against the settings as
	// they will be, and a settings write can never fail on the catalog's account.
	const settingsBody = singletons.settings;
	const settings = await previewSettings({ client, body: settingsBody });
	const settingsWork =
		settingsBody !== undefined && settingsHaveWork({ settings });
	if (settingsWork) {
		write(`${renderPreview({ preview: { settings } })}\n`);
		if (!dryRun) {
			try {
				await client.updateOrganization(settingsBody);
			} catch (error) {
				throw withSettingsScopeHint({ error });
			}
			write("\nApplied settings.\n\n");
		}
	}

	const catalogPreview = (await client.previewUpdate(wire)) as CatalogPreview;
	// The settings lane is already printed when it applied; the unmanaged
	// notes still belong beside the catalog's own rows.
	const preview: CatalogPreview = {
		...catalogPreview,
		...(settingsWork ? {} : { settings }),
	};

	write(`${renderPreview({ preview, migrationLinkBase })}\n`);

	const renameHint = possibleRenameHint({ preview, wire: wire as WireLike });
	if (renameHint !== null) write(`${renameHint}\n\n`);

	const fullPreview: CatalogPreview = { ...catalogPreview, settings };
	if (previewIsEmpty({ preview: catalogPreview })) {
		return { configPath, preview: fullPreview, migrationIds: [] };
	}
	if (dryRun) return { configPath, preview: fullPreview, migrationIds: [] };

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

	return { configPath, preview: fullPreview, applied, migrationIds };
};
