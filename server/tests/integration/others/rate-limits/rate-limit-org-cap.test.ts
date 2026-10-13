/**
 * Pins what an org over its track/check cap gets, by lowering the caps to 0
 * for a throwaway sub-org: track and check still run (queued / fail open),
 * customer reads and creates get the 429 the SDK retries.
 */

import { afterEach, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const testCase = "rate-limit-org-cap";

let restoreOverride: (() => Promise<void>) | undefined;

afterEach(async () => {
	await restoreOverride?.();
	restoreOverride = undefined;
});

const setupOrgOverCap = async ({ customerId }: { customerId: string }) => {
	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				name: "Rate limit org cap",
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
		],
		actions: [],
	});

	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: ctx.org.id,
		limits: {
			[RateLimitType.TrackOrg]: 0,
			[RateLimitType.CheckCustomerGetOrg]: 0,
		},
	}));

	return new AutumnInt({
		version: ApiVersion.V2_4,
		secretKey: ctx.orgSecretKey,
	});
};

test(`${chalk.yellowBright(`${testCase}: track and check degrade, customer reads 429`)}`, async () => {
	const customerId = "rate-limit-org-cap";
	const client = await setupOrgOverCap({ customerId });

	const tracked = await client.post("/track", {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1,
	});
	expect(tracked).toMatchObject({ customer_id: customerId });

	// No product grants messages, so only the fail-open path answers allowed.
	const checked = await client.post("/check", {
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(checked).toMatchObject({ allowed: true });

	await expect(
		client.post("/customers.get_or_create", { customer_id: customerId }),
	).rejects.toMatchObject({ code: "rate_limit_exceeded" });

	await expect(client.get(`/customers/${customerId}`)).rejects.toMatchObject({
		code: "rate_limit_exceeded",
	});
});
