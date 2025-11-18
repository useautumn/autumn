import * as schema from "@autumn/shared";
import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { logger } from "../external/logtail/logtailUtils";
import type { DrizzleCli } from "./initDrizzle";

const SKIP_TABLES = ["migrationErrors"];

export const validateDbSchema = async ({ db }: { db: DrizzleCli }) => {
	// Dynamically get all tables from schema (exclude relations)

	const tableEntries = Object.entries(schema)
		.filter(([name, table]) => {
			// Filter out relations and non-table exports
			if (name.includes("Relations")) return false;
			// Skip migrationErrors table (known issue)
			if (SKIP_TABLES.includes(name)) return false;
			return is(table, PgTable);
		})
		.map(([name, table]) => ({ name, table: table as PgTable }));

	// Validate all tables by selecting all columns to ensure schema matches
	// If schema mismatches, Drizzle will throw an error
	const start = Date.now();
	const results = await Promise.allSettled(
		tableEntries.map(({ name, table }) =>
			db
				.select()
				.from(table)
				.limit(1)
				.then(() => ({ name, success: true as const }))
				.catch((err: Error) => ({
					name,
					success: false as const,
					error: err.message,
				})),
		),
	);
	const elapsed = Date.now() - start;

	// Check for any failures
	const failures = results
		.map((r) => (r.status === "fulfilled" ? r.value : null))
		.filter(
			(v): v is { name: string; success: false; error: string } =>
				v !== null && !v.success,
		);

	if (failures.length > 0) {
		const failureDetails = failures
			.map((f) => `Table '${f.name}': ${f.error}`)
			.join("; ");
		logger.error(
			`Health check failed - DB schema validation error: ${failureDetails}`,
		);
		throw new Error(
			`Health check failed - DB schema validation error: ${failureDetails}`,
		);
	}

	logger.info(
		`Health check passed - DB schema validated for ${tableEntries.length} tables in ${elapsed}ms`,
	);
	return true;
};
