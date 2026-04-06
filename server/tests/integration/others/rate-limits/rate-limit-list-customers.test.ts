import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "rate-limit-list-customers";

const LIST_CUSTOMERS_RATE_LIMIT = 1;

test(`${chalk.yellowBright(testCase)}`, async () => {
	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const requestCount = LIST_CUSTOMERS_RATE_LIMIT + 2;

	const results = await Promise.allSettled(
		Array.from({ length: requestCount }, () => autumnV1.get("/customers")),
	);

	const rateLimitedCount = results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;

	expect(rateLimitedCount).toBeGreaterThan(0);
});
