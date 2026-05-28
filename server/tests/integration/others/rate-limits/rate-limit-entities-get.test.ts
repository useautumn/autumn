import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	RATE_LIMIT_CONFIGS,
	RateLimitType,
} from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const testCase = "rate-limit-entities-get";
const ENTITIES_GET_LIMIT = RATE_LIMIT_CONFIGS[RateLimitType.CustomerEntitiesGet].limit;

const countRateLimited = (results: PromiseSettledResult<unknown>[]): number =>
	results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;

test(`${chalk.yellowBright(`${testCase}: trips the per-customer bucket above the limit`)}`, async () => {
	const customerId = "rate-limit-entities-get";
	const entityId = "entity-rate-limit";

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.entities.create(customerId, {
		id: entityId,
		name: "Rate Limit Entity",
		feature_id: TestFeature.Users,
	});

	const client = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const overLimit = ENTITIES_GET_LIMIT + 10;
	const results = await Promise.allSettled(
		Array.from({ length: overLimit }, () =>
			client.post("/entities.get", {
				customer_id: customerId,
				entity_id: entityId,
			}),
		),
	);

	expect(countRateLimited(results)).toBeGreaterThan(0);
});
