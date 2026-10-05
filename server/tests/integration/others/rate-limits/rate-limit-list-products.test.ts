import { afterAll, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const testCase = "rate-limit-list-products";

// GET /products falls back to the General bucket; lowered for a throwaway sub-org only.
const GENERAL_OVERRIDE_LIMIT = 10;
const REQUEST_COUNT = GENERAL_OVERRIDE_LIMIT * 3;

let restoreOverride: (() => Promise<void>) | undefined;

afterAll(async () => {
	await restoreOverride?.();
});

test(`${chalk.yellowBright(testCase)}`, async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({ name: "Rate limit list products" })],
		actions: [],
	});

	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: ctx.org.id,
		limits: { [RateLimitType.General]: GENERAL_OVERRIDE_LIMIT },
	}));

	const autumnV1 = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const results = await Promise.allSettled(
		Array.from({ length: REQUEST_COUNT }, () => autumnV1.get("/products")),
	);

	const successCount = results.filter((r) => r.status === "fulfilled").length;
	const rateLimitedCount = results.filter(
		(r) =>
			r.status === "rejected" &&
			r.reason instanceof AutumnError &&
			r.reason.code === "rate_limit_exceeded",
	).length;

	console.log(
		`Requests: ${REQUEST_COUNT}, Successes: ${successCount}, Rate limited: ${rateLimitedCount}`,
	);

	expect(successCount + rateLimitedCount).toBe(REQUEST_COUNT);
	expect(rateLimitedCount).toBeGreaterThan(0);
});
