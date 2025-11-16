#!/usr/bin/env bun

import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { redis } from "../src/external/redis/initRedis.js";
import { clearOrg } from "./utils/setupUtils/clearOrg.js";
import { setupOrg } from "./utils/setupUtils/setupOrg.js";

async function main() {
	console.log(chalk.blue("\n🧹 Clearing Master Org...\n"));

	try {
		if (!process.env.TESTS_ORG) {
			console.error(chalk.red("\n❌ TESTS_ORG is not set\n"));
			process.exit(1);
		}

		const org = await clearOrg({
			orgSlug: process.env.TESTS_ORG ?? "",
			env: AppEnv.Sandbox,
		});

		console.log(chalk.green("\n✅ Master org cleared successfully!\n"));

		console.log(chalk.blue("\n🏗️  Setting up master org...\n"));
		await setupOrg({
			orgId: org.id,
			env: AppEnv.Sandbox,
		});
		console.log(chalk.green("\n✅ Master org setup complete!\n"));

		await redis.flushall();
		console.log(chalk.green("\n✅ Redis flushed successfully!\n"));
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error);
		process.exit(1);
	}
}

main();
