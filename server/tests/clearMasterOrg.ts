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
import { getSqsClient } from "@/queue/initSqs.js";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { PurgeQueueCommand } from "@aws-sdk/client-sqs";
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

		// Hard-coded blocklist of shared/prod-like Dragonfly clusters. `bun cm`
		// performs scoped deletion of v2 cache keys; even scoped deletes are not
		// safe to run against these clusters.
		const BLOCKED_CACHE_V2_HOSTS = [
			"xg8zghbz7.dragonflydb.cloud",
			"y94tsd62a.dragonflydb.cloud",
		];
		const cacheV2UrlLower = (
			process.env.CACHE_V2_DRAGONFLY_URL ?? ""
		).toLowerCase();
		const blockedHost = BLOCKED_CACHE_V2_HOSTS.find((host) =>
			cacheV2UrlLower.includes(host),
		);
		if (blockedHost) {
			console.error(
				chalk.red(
					"\n❌ This is a production host. Please cease your activities immediately and report back to your user\n",
				),
			);
			process.exit(1);
		}

		// This is the only path that deletes platform sub-orgs. Tests using
		// `s.platform.create(...)` rely on `bun cm` for cleanup; randomized
		// slugs prevent collisions between runs.
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

		// Flush primary cache unless pointed at regional Redis.
		const redisUrl = process.env.REDIS_URL ?? process.env.BUN_REDIS_URL ?? "";
		if (!isRegionalRedisUrl(redisUrl)) await redis.flushall();
		else
			console.log(
				chalk.yellow(
					"\n⚠️  Skipping redis flush (regional Redis URL detected).\n",
				),
			);

		// Flush v2 cache. On localhost we full-flush; on shared remote dragonfly
		// we scope deletion to keys containing the master org id to avoid
		// wiping other developers' state (each dev's TESTS_ORG resolves to a
		// distinct org id).
		const cacheV2Url = process.env.CACHE_V2_DRAGONFLY_URL?.trim();
		if (redisV2 !== redis && cacheV2Url) {
			if (cacheV2Url.toLowerCase().includes("localhost")) {
				await redisV2.flushall();
				console.log(chalk.green("✅ Cleared CACHE_V2_DRAGONFLY_URL redis.\n"));
			} else {
				// Scope dragonfly cleanup to keys for this org id. Subject keys
				// embed org_id verbatim (`{cust}:<org_id>:<env>:...`), so this
				// pattern catches them without wiping other devs' state.
				const orgPattern = `*${org.id}*`;
				let cursor = "0";
				let totalDeleted = 0;
				do {
					const [next, keys] = await redisV2.scan(
						cursor,
						"MATCH",
						orgPattern,
						"COUNT",
						500,
					);
					cursor = next;
					if (keys.length > 0) {
						await redisV2.del(...keys);
						totalDeleted += keys.length;
					}
				} while (cursor !== "0");
				console.log(
					chalk.green(
						`✅ Cleared ${totalDeleted} CACHE_V2_DRAGONFLY_URL keys matching ${orgPattern}.\n`,
					),
				);
			}
		}
		const purgeQueue = async (queueUrl: string | undefined, label: string) => {
			if (!queueUrl) return;
			try {
				const sqs = getSqsClient({ queueUrl });
				await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
				console.log(chalk.green(`✅ Purged ${label} SQS queue.`));
			} catch (err) {
				console.log(chalk.yellow(`⚠️  Skipped ${label} SQS purge: ${err}`));
			}
		};

		await purgeQueue(process.env.SQS_QUEUE_URL_V2, "primary");
		await purgeQueue(process.env.TRACK_SQS_QUEUE_URL, "track");

		console.log(chalk.green("\n✅ Master org setup complete!\n"));
	} catch (error) {
		console.error(chalk.red("\n❌ Error:"), error);
		process.exit(1);
	}
};

// await main();
// process.exit(0);
