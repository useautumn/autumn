/**
 * ducklake: in-region lake aggregation job. Scans the Iceberg lake from
 * us-east-2 (same-region S3 = free), writes prepared parquet to a scratch
 * prefix, then has MotherDuck ingest the small files — replacing the
 * cross-region flights and the server cron's MotherDuck rebuild.
 * Contracts + phases: plans/ducklake/research.md
 */

/** Structural so both pino and the server's logtail logger satisfy it. */
export type DucklakeLogger = {
	info: (obj: unknown, msg?: string) => void;
	warn: (obj: unknown, msg?: string) => void;
	error: (obj: unknown, msg?: string) => void;
};

export type DucklakeRunResult = {
	tablesRefreshed: string[];
	skipped: string[];
};

export const runDucklake = async ({
	logger,
}: {
	logger: DucklakeLogger;
}): Promise<DucklakeRunResult> => {
	logger.info(
		{ type: "ducklake_run" },
		"[ducklake] scaffold — aggregation phases not implemented yet",
	);
	return { tablesRefreshed: [], skipped: [] };
};
