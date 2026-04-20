#!/usr/bin/env bun

import dotenv from "dotenv";

dotenv.config();

import { AppEnv } from "@autumn/shared";

import chalk from "chalk";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { clearOrg } from "./utils/setup/clearOrg.js";
import { setupOrg } from "./utils/setup/setupOrg.js";

export const clearMasterOrg = async () => {
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

		const isRegionalRedisUrl = (url: string | undefined) =>
			(url ?? "").toLowerCase().includes("redis-17710.mc1716-0.us");

		// Flush primary cache if not pointed at regional Redis
		const redisUrl = process.env.REDIS_URL ?? process.env.BUN_REDIS_URL ?? "";
		if (!isRegionalRedisUrl(redisUrl)) await redis.flushall();
		else
			console.log(
				chalk.yellow(
					"\n⚠️  Skipping redis flush (regional Redis URL detected).\n",
				),
			);

		// Flush v2 cache (CACHE_V2_URL) if it's a distinct, non-regional connection
		const cacheV2Url = process.env.CACHE_V2_URL?.trim();
		if (redisV2 !== redis && cacheV2Url) {
			if (!isRegionalRedisUrl(cacheV2Url)) {
				await redisV2.flushall();
				console.log(chalk.green("✅ Cleared CACHE_V2_URL redis.\n"));
			} else {
				console.log(
					chalk.yellow(
						"\n⚠️  Skipping CACHE_V2_URL flush (regional Redis URL detected).\n",
					),
				);
			}
		}
		console.log(chalk.green("\n✅ Master org setup complete!\n"));
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error);
		process.exit(1);
	}
};

// await main();
// process.exit(0);
