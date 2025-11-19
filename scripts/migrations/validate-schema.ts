import { initDrizzle } from "@server/db/initDrizzle";
import { validateDbSchema } from "@server/db/validateDbSchema";
import { validateSqlFunctions } from "@server/db/validateSqlFunctions";

const { db } = initDrizzle({ maxConnections: 5 });

// Check if --validate-content flag is passed
const validateContent = process.argv.includes("--validate-content");

try {
	console.log("Validating database schema...");
	await validateDbSchema({ db });
	console.log("✅ Database schema validated successfully\n");

	console.log(
		`Validating SQL functions${validateContent ? " (with content validation)" : ""}...`,
	);
	await validateSqlFunctions({ db, validateContent });
	console.log("✅ SQL functions validated successfully\n");

	console.log("✅ All validations passed!");
	process.exit(0);
} catch (error) {
	console.error("❌ Validation failed:", error);
	process.exit(1);
}
