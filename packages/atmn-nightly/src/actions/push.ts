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

	if (previewIsEmpty({ preview })) {
		return { configPath, preview, migrationIds: [] };
	}
	if (dryRun) {
		write("\nDry run — nothing applied.\n");
		return { configPath, preview, migrationIds: [] };
	}

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
	const { backfilled } = backfillInternalIds({ rows, configPath });
	if (backfilled.length > 0) {
		write(
			`Wrote internalId into ${backfilled.length} fixture${backfilled.length === 1 ? "" : "s"}.\n`,
		);
	}

	return { configPath, preview, applied, migrationIds };
};
