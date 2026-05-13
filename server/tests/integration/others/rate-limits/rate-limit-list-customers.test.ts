import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	RATE_LIMIT_CONFIGS,
	resolveRateLimit,
} from "@/internal/misc/rateLimiter/rateLimitConfigs";

const testCase = "rate-limit-list-customers";

const LEGACY_LIMIT = RATE_LIMIT_CONFIGS.list_customers.limit;
const V2_3_LIMIT = resolveRateLimit({
	config: RATE_LIMIT_CONFIGS.list_customers,
	apiVersion: ApiVersion.V2_3,
}).limit;

const countRateLimited = (
	results: PromiseSettledResult<unknown>[],
): number => {
	return results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;
};

test(`${chalk.yellowBright(`${testCase}: legacy limit (V1.2)`)}`, async () => {
	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const requestCount = LEGACY_LIMIT + 2;
	const results = await Promise.allSettled(
		Array.from({ length: requestCount }, () => autumnV1.get("/customers")),
	);

	expect(countRateLimited(results)).toBeGreaterThan(0);
});

test(`${chalk.yellowBright(`${testCase}: V2.3 higher cursor limit`)}`, async () => {
	const autumnV2_3 = new AutumnInt({
		version: ApiVersion.V2_3,
		secretKey: ctx.orgSecretKey,
	});

	const belowLimit = Math.max(1, V2_3_LIMIT - 2);
	const belowResults = await Promise.allSettled(
		Array.from({ length: belowLimit }, () =>
			autumnV2_3.customers.listV2({ cursor: "", limit: 10 }),
		),
	);
	expect(countRateLimited(belowResults)).toBe(0);

	const overLimit = V2_3_LIMIT + 5;
	const overResults = await Promise.allSettled(
		Array.from({ length: overLimit }, () =>
			autumnV2_3.customers.listV2({ cursor: "", limit: 10 }),
		),
	);
	expect(countRateLimited(overResults)).toBeGreaterThan(0);
});
