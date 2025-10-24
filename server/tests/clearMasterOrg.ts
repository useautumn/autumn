#!/usr/bin/env bun

import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { clearOrg } from "./utils/setupUtils/clearOrg.js";
import { setupOrg } from "./utils/setupUtils/setupOrg.js";

async function main() {
	console.log(chalk.blue("\n🧹 Clearing Master Org...\n"));

	try {
		const org = await clearOrg({
			orgSlug: process.env.TESTS_ORG ?? "",
			env: AppEnv.Sandbox,
		});

		console.log(chalk.green("\n✅ Master org cleared successfully!\n"));

		// Ask if user wants to set up features
		const shouldSetup = confirm(
			"Do you want to set up v2 features for the master org?",
		);

		if (shouldSetup) {
			console.log(chalk.blue("\n🏗️  Setting up master org...\n"));
			await setupOrg({
				orgId: org.id,
				env: AppEnv.Sandbox,
			});
			console.log(chalk.green("\n✅ Master org setup complete!\n"));
		}
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error);
		process.exit(1);
	}
}

main();
