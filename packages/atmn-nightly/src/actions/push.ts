import { join } from "node:path";
import { loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import type { AutumnClient } from "../generated/client";
import {
	type CatalogPreview,
	previewIsEmpty,
	renderMigrationLinks,
	renderPreview,
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

export type PushResult = {
	configPath: string;
	preview: CatalogPreview;
	/** Absent on a dry run, or when the preview showed nothing to do. */
	applied?: unknown;
	migrationIds: string[];
};

export type PushOptions = {
	client: AutumnClient;
	cwd?: string;
	dryRun?: boolean;
	/** Where to write progress. Injected so tests can capture it. */
	write?: (text: string) => void;
	migrationLinkBase?: string;
};

type WireLike = {
	features?: { feature_id?: string; internal_id?: string }[];
	plans?: { plan_id?: string; internal_id?: string }[];
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
		rows: { action?: string; featureId?: string; planId?: string }[];
		idOf: (row: { featureId?: string; planId?: string }) => string | undefined;
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

	const { path: configPath, wire } = await loadConfig({ dirs });

	const deprecated = deprecatedUsesIn({
		wire: wire as Record<string, unknown>,
	});
	if (deprecated.length > 0)
		write(`${renderDeprecatedUses({ uses: deprecated })}\n\n`);

	const preview = (await client.previewUpdate(
		wire as Record<string, unknown>,
	)) as CatalogPreview;

	write(`${renderPreview({ preview, migrationLinkBase })}\n`);

	const renameHint = possibleRenameHint({ preview, wire: wire as WireLike });
	if (renameHint !== null) write(`${renameHint}\n\n`);

	if (previewIsEmpty({ preview })) {
		return { configPath, preview, migrationIds: [] };
	}
	if (dryRun) return { configPath, preview, migrationIds: [] };

	const applied = (await client.update(wire as Record<string, unknown>)) as {
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

	return { configPath, preview, applied, migrationIds };
};
