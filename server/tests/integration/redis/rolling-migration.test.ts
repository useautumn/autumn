import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	type Organization,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { db } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getCustomerBucket } from "@/external/redis/customerRedisRouting.js";
import { getOrgRedis, removeOrgRedis } from "@/external/redis/orgRedisPool.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";

const TEST_ORG_REDIS_URL = process.env.TEST_ORG_REDIS_URL;
if (!TEST_ORG_REDIS_URL) {
	throw new Error(
		"TEST_ORG_REDIS_URL is required to run rolling migration tests",
	);
}

const INCLUDED_USAGE = 1000;
const TRACK_AMOUNT = 10;

const findCustomerIdInBucketRange = ({
	min,
	max,
	prefix,
}: {
	min: number;
	max: number;
	prefix: string;
}): string => {
	for (let i = 0; i < 50000; i++) {
		const id = `${prefix}-${i}`;
		const bucket = getCustomerBucket(id);
		if (bucket >= min && bucket < max) return id;
	}
	throw new Error(`No customer found in bucket range [${min}, ${max})`);
};

const customerLowId = findCustomerIdInBucketRange({
	min: 0,
	max: 50,
	prefix: "rm-low",
});
const customerHighId = findCustomerIdInBucketRange({
	min: 50,
	max: 100,
	prefix: "rm-high",
});

const freeProd = products.base({
	id: "rm-free",
	items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
});

let orgId: string;
let originalRedisConfig: Organization["redis_config"];
let autumnV2Low: AutumnInt;
let autumnV2High: AutumnInt;

const updateMigrationPercent = async ({
	percent,
}: {
	percent: number;
}): Promise<Organization> => {
	const currentOrg = await OrgService.get({ db, orgId });

	const updatedOrg = await OrgService.update({
		db,
		orgId,
		updates: {
			redis_config: {
				...currentOrg.redis_config!,
				previousMigrationPercent: currentOrg.redis_config!.migrationPercent,
				migrationPercent: percent,
				migrationChangedAt: Date.now(),
			},
		},
	});

	return updatedOrg!;
};

const trackAndCheck = async ({
	autumnClient,
	customerId,
	expectedBalance,
}: {
	autumnClient: AutumnInt;
	customerId: string;
	expectedBalance: number;
}) => {
	await autumnClient.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: TRACK_AMOUNT,
		},
		{},
	);

	const checkResult = await autumnClient.check<CheckResponseV2>(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		},
		{},
	);

	expect(checkResult.allowed).toBe(true);
	expect(checkResult.balance?.current_balance).toBe(expectedBalance);
};

describe(
	chalk.yellowBright("rolling-migration: track + check across migration steps"),
	() => {
		beforeAll(async () => {
			const scenarioLow = await initScenario({
				customerId: customerLowId,
				setup: [
					s.customer({ testClock: false }),
					s.products({ list: [freeProd] }),
				],
				actions: [s.attach({ productId: freeProd.id })],
			});

			orgId = scenarioLow.ctx.org.id;
			originalRedisConfig = scenarioLow.ctx.org.redis_config;
			autumnV2Low = new AutumnInt({ version: ApiVersion.V2_0 });

			await initScenario({
				customerId: customerHighId,
				setup: [
					s.customer({ testClock: false }),
					s.products({ list: [freeProd] }),
				],
				actions: [s.attach({ productId: freeProd.id })],
			});
			autumnV2High = new AutumnInt({ version: ApiVersion.V2_0 });

			const encryptedConnectionString = encryptData(TEST_ORG_REDIS_URL!);
			let url: string;
			try {
				url = new URL(TEST_ORG_REDIS_URL!).hostname;
			} catch {
				url = TEST_ORG_REDIS_URL!;
			}

			const updatedOrg = await OrgService.update({
				db,
				orgId,
				updates: {
					redis_config: {
						connectionString: encryptedConnectionString,
						url,
						migrationPercent: 0,
						previousMigrationPercent: 0,
						migrationChangedAt: Date.now(),
					},
				},
			});

			getOrgRedis({ org: updatedOrg! });

			await timeout(1000);
		});

		afterAll(async () => {
			await OrgService.update({
				db,
				orgId,
				updates: { redis_config: originalRedisConfig ?? null },
			});

			removeOrgRedis({ orgId });
		});

		test("0%: track and check — all on master", async () => {
			await trackAndCheck({
				autumnClient: autumnV2Low,
				customerId: customerLowId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT,
			});

			await trackAndCheck({
				autumnClient: autumnV2High,
				customerId: customerHighId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT,
			});

			// Wait for sync to flush deductions to Postgres before changing migration percent.
			// Without this, the next step's cache miss reads stale Postgres data.
			await timeout(4000);
		});

		test("50%: step to split routing — low bucket on dedicated, high on master", async () => {
			await updateMigrationPercent({ percent: 50 });

			await trackAndCheck({
				autumnClient: autumnV2Low,
				customerId: customerLowId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 2,
			});

			await trackAndCheck({
				autumnClient: autumnV2High,
				customerId: customerHighId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 2,
			});

			await timeout(4000);
		});

		test("100%: all on dedicated", async () => {
			await updateMigrationPercent({ percent: 100 });

			await trackAndCheck({
				autumnClient: autumnV2Low,
				customerId: customerLowId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 3,
			});

			await trackAndCheck({
				autumnClient: autumnV2High,
				customerId: customerHighId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 3,
			});

			await timeout(4000);
		});

		test("0%: rollback — all back on master", async () => {
			await updateMigrationPercent({ percent: 0 });

			await trackAndCheck({
				autumnClient: autumnV2Low,
				customerId: customerLowId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 4,
			});

			await trackAndCheck({
				autumnClient: autumnV2High,
				customerId: customerHighId,
				expectedBalance: INCLUDED_USAGE - TRACK_AMOUNT * 4,
			});

			await timeout(4000);

			// Final Postgres verification after last sync settles
			const checkLow = await autumnV2Low.check<CheckResponseV2>(
				{
					customer_id: customerLowId,
					feature_id: TestFeature.Messages,
					skip_cache: true,
				},
				{},
			);

			const checkHigh = await autumnV2High.check<CheckResponseV2>(
				{
					customer_id: customerHighId,
					feature_id: TestFeature.Messages,
					skip_cache: true,
				},
				{},
			);

			const expectedFinal = INCLUDED_USAGE - TRACK_AMOUNT * 4;
			expect(checkLow.balance?.current_balance).toBe(expectedFinal);
			expect(checkHigh.balance?.current_balance).toBe(expectedFinal);
		});
	},
);
