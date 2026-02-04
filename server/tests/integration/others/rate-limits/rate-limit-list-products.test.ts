import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "rate-limit-list-products";

// ListProducts rate limit is 20 per second per org
const LIST_PRODUCTS_RATE_LIMIT = 20;

/**
 * Test: Rate limit on GET /products endpoint
 */
test(`${chalk.yellowBright(testCase)}`, async () => {
	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	// Fire off more requests than the rate limit allows
	const requestCount = LIST_PRODUCTS_RATE_LIMIT + 5;

	const results = await Promise.allSettled(
		Array.from({ length: requestCount }, () => autumnV1.get("/products")),
	);

	const successCount = results.filter((r) => r.status === "fulfilled").length;
	const rateLimitedCount = results.filter(
		(r) =>
			r.status === "rejected" &&
			r.reason instanceof AutumnError &&
			r.reason.code === "rate_limit_exceeded",
	).length;

	console.log(
		`Requests: ${requestCount}, Successes: ${successCount}, Rate limited: ${rateLimitedCount}`,
	);

	expect(rateLimitedCount).toBeGreaterThan(0);

	const rateLimitedResult = results.find(
		(r) =>
			r.status === "rejected" &&
			r.reason instanceof AutumnError &&
			r.reason.code === "rate_limit_exceeded",
	);
	expect(rateLimitedResult).toBeDefined();
});
