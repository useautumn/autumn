import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "./initDrizzle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const initializeDatabaseFunctions = async () => {
	try {
		console.log("Initializing database functions...");

		const sqlPath = join(__dirname, "../internal/balances/utils/sql");

		const sqlFiles = [
			"deductFromMainBalance.sql",
			"creditRateUtils.sql",
			"deductFromRollovers.sql",
			"unwindFromLockReceipt.sql",
			"getTotalBalance.sql",
			"deductFromAdditionalBalance.sql",
			"getAvailableOverageFromSpendLimit.sql",
			"performDeduction.sql",
			"syncBalances.sql",
			"syncBalancesV2.sql",
			"resetCusEnts.sql",
		];

		for (const file of sqlFiles) {
			const sqlContent = readFileSync(join(sqlPath, file), "utf-8");
			await db.execute(sql.raw(sqlContent));
			console.log(`  ✓ Loaded ${file}`);
		}

		console.log("Database functions initialized successfully");
	} catch (error) {
		console.error("Failed to initialize database functions:", error);
		throw error;
	}
};
