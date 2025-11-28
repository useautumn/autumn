import { initializeDatabaseFunctions } from "@server/db/initializeDatabaseFunctions";
import { loadLocalEnv } from "@server/utils/envUtils";
import inquirer from "inquirer";

loadLocalEnv();

export const migrateFunctions = async () => {
	const databaseUrl = process.env.DATABASE_URL;
	if (databaseUrl?.includes("us-west-3")) {
		const { confirm } = await inquirer.prompt([
			{
				type: "confirm",
				name: "confirm",
				message:
					"You are about to initialize database functions on PRODUCTION (us-west-3). Continue?",
				default: false,
			},
		]);

		if (!confirm) {
			console.log("Operation cancelled.");
			process.exit(0);
		}
	}

	await initializeDatabaseFunctions();
};

await migrateFunctions();
process.exit(0);
