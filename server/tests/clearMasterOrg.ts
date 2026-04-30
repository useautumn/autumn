#!/usr/bin/env bun

import dotenv from "dotenv";

dotenv.config();

import { AppEnv, type Organization, organizations } from "@autumn/shared";

import chalk from "chalk";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrg } from "./utils/setup/clearOrg.js";
import { setupOrg } from "./utils/setup/setupOrg.js";

export const clearMasterOrg = async () => {
	console.log(chalk.blue("\n🧹 Clearing Master Org...\n"));

	try {
		if (!process.env.TESTS_ORG) {
			console.error(chalk.red("\n❌ TESTS_ORG is not set\n"));
			process.exit(1);
		}

		const databaseUrl = process.env.DATABASE_URL ?? "";
		if (databaseUrl.toLowerCase().includes("fancy-duckling")) {
			console.error(
				chalk.red(
					"\n❌ Refusing to run clearMasterOrg against prod-like DATABASE_URL (contains 'fancy-duckling').\n",
				),
			);
			process.exit(1);
		}

		// Clean up any platform sub-orgs created by this master org first.
		// IMPORTANT: this is the ONLY path that auto-deletes platform sub-orgs.
		// Tests created via `s.platform.create(...)` do NOT clean up after
		// themselves — sub-orgs accumulate across test runs and are only
		// cleared here, when an operator explicitly invokes `bun cm`. Each
		// `s.platform.create(...)` defaults to a randomized slug so the buildup
		// doesn't cause slug collisions between runs.
		{
			const { db, client } = initDrizzle();
			try {
				const masterOrg = await OrgService.getBySlug({
					db,
					slug: process.env.TESTS_ORG,
				});

				if (!masterOrg) {
					console.log(
						chalk.yellow(
							`\n⚠️  Master org '${process.env.TESTS_ORG}' not found; skipping sub-org cleanup.\n`,
						),
					);
				} else {
					const subOrgs = (await db.query.organizations.findMany({
						where: eq(organizations.created_by, masterOrg.id),
					})) as Organization[];

					console.log(
						chalk.blue(
							`\n🧹 Found ${subOrgs.length} platform sub-org(s) to delete...\n`,
						),
					);

					const BATCH_SIZE = 10;
					for (let i = 0; i < subOrgs.length; i += BATCH_SIZE) {
						const batch = subOrgs.slice(i, i + BATCH_SIZE);
						await Promise.all(
							batch.map(async (subOrg) => {
								try {
									await deletePlatformSubOrg({
										db,
										org: subOrg,
										logger,
										skipLiveCustomerCheck: true,
									});
									console.log(
										chalk.green(
											`   ✅ Deleted sub-org ${subOrg.slug} (${subOrg.id})`,
										),
									);
								} catch (err) {
									console.error(
										chalk.red(
											`   ❌ Failed to delete sub-org ${subOrg.slug} (${subOrg.id}):`,
										),
										err,
									);
								}
							}),
						);
					}
				}
			} finally {
				await client.end();
			}
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
		const cacheV2Url = process.env.CACHE_V2_UPSTASH_URL?.trim();
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
