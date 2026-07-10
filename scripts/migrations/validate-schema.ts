import { initDrizzle } from "@server/db/initDrizzle";
import { validateDbSchema } from "@server/db/validateDbSchema";
import { validateSqlFunctions } from "@server/db/validateSqlFunctions";

const maxConnections = Number(process.env.DB_MAX_CONNECTIONS ?? 5);
const schemaValidationConcurrency = Number(
	process.env.DB_SCHEMA_VALIDATION_CONCURRENCY ?? maxConnections,
);

const { db } = initDrizzle({
	maxConnections,
});

// Check if --validate-content flag is passed
const validateContent = process.argv.includes("--validate-content");

// Each run reports independently so a main-DB failure can't mask the Neon result.
const failures: string[] = [];

console.log("═══ RUN 1/2 · MAIN DB (DATABASE_URL) ═══");
try {
	console.log("Validating database schema...");
	await validateDbSchema({
		db,
		concurrency: schemaValidationConcurrency,
		label: "main-db",
	});
	console.log("✅ [main-db] schema validated successfully\n");

	console.log(
		`Validating SQL functions${validateContent ? " (with content validation)" : ""}...`,
	);
	await validateSqlFunctions({ db, validateContent });
	console.log("✅ [main-db] SQL functions validated successfully\n");
} catch (error) {
	failures.push("main-db");
	console.error(
		`❌ [main-db] validation failed: ${error instanceof Error ? error.message : error}\n`,
	);
}

console.log("═══ RUN 2/2 · NEON EVENTS DB (NEON_EVENTS_READ_ONLY_URL) ═══");
if (process.env.NEON_EVENTS_READ_ONLY_URL) {
	try {
		console.log("Validating Neon events schema...");
		const { db: neonDb } = initDrizzle({
			databaseUrl: process.env.NEON_EVENTS_READ_ONLY_URL,
			maxConnections: 1,
		});
		const { neonEventsSchema } = await import("@autumn/shared");
		await validateDbSchema({
			db: neonDb,
			schemaExports: neonEventsSchema,
			concurrency: 1,
			label: "neon-events",
		});
		console.log("✅ [neon-events] schema validated successfully\n");
	} catch (error) {
		failures.push("neon-events");
		console.error(
			`❌ [neon-events] validation failed: ${error instanceof Error ? error.message : error}\n`,
		);
	}
} else {
	console.log("(skipped — NEON_EVENTS_READ_ONLY_URL not set)\n");
}

if (failures.length > 0) {
	console.error(`❌ Validation failed in: ${failures.join(", ")}`);
	process.exit(1);
}

console.log("✅ All validations passed!");
process.exit(0);
