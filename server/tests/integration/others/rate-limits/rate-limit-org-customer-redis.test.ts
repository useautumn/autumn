/**
 * Runs the org and customer limiters against the real misc Redis: a sync track
 * counts both keys with their windows, and an over-cap org leaves the customer key alone.
 */

import { afterEach, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getMiscRedis, waitForRedisReady } from "@/external/redis/initRedis.js";

const testCase = "rate-limit-org-customer-redis";

let restoreOverride: (() => Promise<void>) | undefined;

afterEach(async () => {
	await restoreOverride?.();
	restoreOverride = undefined;
});

const setupSubOrg = async ({
	customerId,
	limits,
}: {
	customerId: string;
	limits: { sync_balance_write: number; sync_balance_write_org: number };
}) => {
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				name: "Org customer limits",
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
		],
		actions: [],
	});
	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: ctx.org.id,
		limits,
	}));

	const redis = getMiscRedis();
	await waitForRedisReady(redis, "main");
	const keyPrefix = `${ctx.org.id}:${ctx.env}`;
	return {
		client: new AutumnInt({
			version: ApiVersion.V2_5,
			secretKey: ctx.orgSecretKey,
		}),
		redis,
		orgKey: `hrl:sync_balance_write_org:${keyPrefix}`,
		customerKey: `hrl:sync_balance_write:${keyPrefix}:${customerId}`,
	};
};

const syncTrack = ({
	client,
	customerId,
}: {
	client: AutumnInt;
	customerId: string;
}) =>
	client.post("/balances.track", {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		async: false,
	});

const isRateLimited = (result: PromiseSettledResult<unknown>) =>
	result.status === "rejected" &&
	result.reason instanceof AutumnError &&
	result.reason.code === "rate_limit_exceeded";

test(`${chalk.yellowBright(`${testCase}1: a sync track counts both keys with their windows`)}`, async () => {
	const customerId = `${testCase}-counts`;
	const { client, redis, orgKey, customerKey } = await setupSubOrg({
		customerId,
		limits: { sync_balance_write: 100, sync_balance_write_org: 100 },
	});

	await syncTrack({ client, customerId });
	const [[, orgHits], [, orgTtl], [, customerHits], [, customerTtl]] =
		(await redis
			.multi()
			.get(orgKey)
			.pttl(orgKey)
			.get(customerKey)
			.pttl(customerKey)
			.exec()) as [unknown, string | number][];

	expect(Number(orgHits)).toBe(1);
	expect(Number(orgTtl)).toBeGreaterThan(0);
	expect(Number(orgTtl)).toBeLessThanOrEqual(60_000);
	expect(Number(customerHits)).toBe(1);
	expect(Number(customerTtl)).toBeGreaterThan(0);
	expect(Number(customerTtl)).toBeLessThanOrEqual(1000);
});

test(`${chalk.yellowBright(`${testCase}2: over the org cap → 429 and the customer key is not counted`)}`, async () => {
	const customerId = `${testCase}-org-cap`;
	const { client, redis, orgKey, customerKey } = await setupSubOrg({
		customerId,
		limits: { sync_balance_write: 100, sync_balance_write_org: 1 },
	});

	await syncTrack({ client, customerId });
	const [rejected] = await Promise.allSettled([
		syncTrack({ client, customerId }),
	]);

	expect(isRateLimited(rejected)).toBe(true);
	expect(Number(await redis.get(orgKey))).toBe(2);
	expect(Number((await redis.get(customerKey)) ?? 0)).toBeLessThanOrEqual(1);
});

test(`${chalk.yellowBright(`${testCase}3: over the customer cap → 429`)}`, async () => {
	const customerId = `${testCase}-customer-cap`;
	const { client } = await setupSubOrg({
		customerId,
		limits: { sync_balance_write: 1, sync_balance_write_org: 100 },
	});

	const results = await Promise.allSettled(
		Array.from({ length: 3 }, () => syncTrack({ client, customerId })),
	);

	expect(results.filter(isRateLimited).length).toBeGreaterThan(0);
});
