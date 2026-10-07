/**
 * On 2.5, synchronous tracks and writing checks from one customer drain one
 * shared counter; 2.4 sync tracks and 2.5 default (async) tracks never touch it.
 */

import { afterEach, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "rate-limit-sync-balance-write";

// Each request type alone stays within the limit; together they exceed it.
const SYNC_WRITE_LIMIT = 3;

const countRateLimited = (results: PromiseSettledResult<unknown>[]): number =>
	results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;

let restoreOverride: (() => Promise<void>) | undefined;

afterEach(async () => {
	await restoreOverride?.();
	restoreOverride = undefined;
});

const setupLimitedSubOrg = async ({ customerId }: { customerId: string }) => {
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				name: "Sync balance write limits",
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
		],
		actions: [],
	});

	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: ctx.org.id,
		limits: { sync_balance_write: SYNC_WRITE_LIMIT },
	}));

	return { secretKey: ctx.orgSecretKey };
};

const fireTracksAndLockChecks = ({
	client,
	customerId,
	trackAsync,
}: {
	client: AutumnInt;
	customerId: string;
	trackAsync?: boolean;
}) =>
	Promise.allSettled(
		Array.from({ length: SYNC_WRITE_LIMIT }, (_, index) => [
			client.post("/balances.track", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				async: trackAsync,
			}),
			client.post("/balances.check", {
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				lock: { enabled: true, lock_id: `${testCase}-${index}` },
			}),
		]).flat(),
	);

test(`${chalk.yellowBright(`${testCase}1: 2.5 sync tracks and lock checks drain one counter`)}`, async () => {
	const customerId = `${testCase}-shared`;
	const { secretKey } = await setupLimitedSubOrg({ customerId });
	const client = new AutumnInt({ version: ApiVersion.V2_5, secretKey });

	const results = await fireTracksAndLockChecks({
		client,
		customerId,
		trackAsync: false,
	});

	expect(countRateLimited(results)).toBeGreaterThan(0);
});

test(`${chalk.yellowBright(`${testCase}2: 2.4 sync tracks and 2.5 default tracks stay off the counter`)}`, async () => {
	const customerId = `${testCase}-untouched`;
	const { secretKey } = await setupLimitedSubOrg({ customerId });
	const tracks = ({
		version,
		async,
	}: {
		version: ApiVersion;
		async?: boolean;
	}) => {
		const client = new AutumnInt({ version, secretKey });
		return Promise.allSettled(
			Array.from({ length: SYNC_WRITE_LIMIT * 2 }, () =>
				client.post("/balances.track", {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					async,
				}),
			),
		);
	};

	expect(
		countRateLimited(await tracks({ version: ApiVersion.V2_4, async: false })),
	).toBe(0);
	expect(countRateLimited(await tracks({ version: ApiVersion.V2_5 }))).toBe(0);
});
