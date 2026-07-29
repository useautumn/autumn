import * as schema from "@autumn/shared";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { logger } from "../external/logtail/logtailUtils";
import type { DrizzleCli } from "./initDrizzle";

// eventsNeon lives on the Neon DB — validated by the dedicated neon-events pass, not the main one.
const SKIP_TABLES = ["migrationErrors", "eventsNeon"];

type TableEntry = {
	name: string;
	table: PgTable;
};

type TableValidationResult =
	| { name: string; success: true }
	| { name: string; success: false; error: string };

const validateTable = async ({
	db,
	tableEntry,
}: {
	db: DrizzleCli;
	tableEntry: TableEntry;
}): Promise<TableValidationResult> => {
	const { name, table } = tableEntry;
	try {
		await db.select().from(table).limit(1);
		return { name, success: true };
	} catch (err) {
		return {
			name,
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
};

const validateTablesWithConcurrency = async ({
	db,
	tableEntries,
	concurrency,
}: {
	db: DrizzleCli;
	tableEntries: TableEntry[];
	concurrency: number;
}): Promise<TableValidationResult[]> => {
	const results: TableValidationResult[] = [];
	let nextIndex = 0;

	const workerCount = Math.min(concurrency, tableEntries.length);
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (nextIndex < tableEntries.length) {
				const index = nextIndex++;
				results[index] = await validateTable({
					db,
					tableEntry: tableEntries[index],
				});
			}
		}),
	);

	return results;
};

export const validateDbSchema = async ({
	db,
	concurrency = 5,
	schemaExports = schema,
	label,
}: {
	db: DrizzleCli;
	concurrency?: number;
	schemaExports?: Record<string, unknown>;
	label?: string;
}) => {
	// Dynamically get all tables from schema (exclude relations)
	const logPrefix = label ? `[${label}] ` : "";

	const tableEntries = Object.entries(schemaExports)
		.filter(([name, table]) => {
			// Filter out relations and non-table exports
			if (name.includes("Relations")) return false;
			// Skip migrationErrors table (known issue)
			if (SKIP_TABLES.includes(name)) return false;
			return is(table, PgTable);
		})
		.map(([name, table]) => ({ name, table: table as PgTable }));

	const validatedConcurrency =
		Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1;
	const start = Date.now();
	const results = await validateTablesWithConcurrency({
		db,
		tableEntries,
		concurrency: validatedConcurrency,
	});
	const elapsed = Date.now() - start;

	// Check for any failures
	const failures = results.filter(
		(v): v is { name: string; success: false; error: string } => !v.success,
	);

	if (failures.length > 0) {
		const failureDetails = failures
			.map((f) => `Table '${f.name}': ${f.error}`)
			.join("; ");
		logger.error(
			`${logPrefix}Health check failed - DB schema validation error: ${failureDetails}`,
		);
		throw new Error(
			`${logPrefix}Health check failed - DB schema validation error: ${failureDetails}`,
		);
	}

	logger.info(
		`${logPrefix}Health check passed - DB schema validated for ${tableEntries.length} tables in ${elapsed}ms (concurrency=${validatedConcurrency})`,
	);
	return true;
};
