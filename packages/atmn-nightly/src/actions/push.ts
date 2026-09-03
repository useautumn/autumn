import { join } from "node:path";
import { loadConfig } from "../config/loadConfig";
import { loadEnvFiles } from "../env/loadEnv";
import type { AutumnClient } from "../generated/client";
import {
	type CatalogPreview,
	previewIsEmpty,
	renderPreview,
} from "../render/renderPreview";
import { findRepoLayout } from "../repo/findRepoRoot";
import { backfillInternalIds } from "./push/backfillInternalIds";

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

	const { backfilled } = backfillInternalIds({
		results: applied.results ?? {},
		configPath,
	});
	if (backfilled.length > 0) {
		write(
			`Wrote internalId into ${backfilled.length} fixture${backfilled.length === 1 ? "" : "s"}.\n`,
		);
	}

	return { configPath, preview, applied, migrationIds };
};
