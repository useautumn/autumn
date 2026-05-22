/**
 * Asserts the edge-config rate-limit override is actually honored by the
 * factory at request time. We point the override at /v1/entities.get for
 * the test org (which has a default limit of 100/s) and reduce it to 5/s.
 * 6+ parallel requests should then trip the limit.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { _setRateLimitOverridesConfigForTesting } from "@/internal/misc/rateLimiter/rateLimitOverridesStore.js";

const testCase = "rate-limit-overrides";

const countRateLimited = (results: PromiseSettledResult<unknown>[]): number =>
	results.filter(
		(result) =>
			result.status === "rejected" &&
			result.reason instanceof AutumnError &&
			result.reason.code === "rate_limit_exceeded",
	).length;

let orgIdForRevert: string | undefined;

beforeAll(() => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
});

afterAll(() => {
	_setRateLimitOverridesConfigForTesting({ config: { orgs: {} } });
});

test(`${chalk.yellowBright(`${testCase}: override lowers effective limit for the org`)}`, async () => {
	const customerId = "rate-limit-override-lower";
	const entityId = "entity-rate-limit-override";

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.entities.create(customerId, {
		id: entityId,
		name: "Rate Limit Override Entity",
		feature_id: TestFeature.Users,
	});

	orgIdForRevert = ctx.org.id;
	_setRateLimitOverridesConfigForTesting({
		config: {
			orgs: {
				[ctx.org.id]: {
					limits: { [RateLimitType.CustomerEntitiesGet]: 5 },
				},
			},
		},
	});

	const client = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	// 12 requests, override is 5/s — well above the override, well below the
	// default of 100. If the override is being honored, several get 429'd.
	const results = await Promise.allSettled(
		Array.from({ length: 12 }, () =>
			client.post("/entities.get", {
				customer_id: customerId,
				entity_id: entityId,
			}),
		),
	);

	expect(countRateLimited(results)).toBeGreaterThan(0);
});

test(`${chalk.yellowBright(`${testCase}: orgSlug fallback resolves the override`)}`, async () => {
	const customerId = "rate-limit-override-slug";
	const entityId = "entity-rate-limit-slug";

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.entities.create(customerId, {
		id: entityId,
		name: "Rate Limit Override Slug Entity",
		feature_id: TestFeature.Users,
	});

	const slug = ctx.org.slug;
	if (!slug) throw new Error("test org has no slug");

	orgIdForRevert = ctx.org.id;
	_setRateLimitOverridesConfigForTesting({
		config: {
			orgs: {
				[slug]: { limits: { [RateLimitType.CustomerEntitiesGet]: 5 } },
			},
		},
	});

	const client = new AutumnInt({
		version: ApiVersion.V1_2,
		secretKey: ctx.orgSecretKey,
	});

	const results = await Promise.allSettled(
		Array.from({ length: 12 }, () =>
			client.post("/entities.get", {
				customer_id: customerId,
				entity_id: entityId,
			}),
		),
	);

	expect(countRateLimited(results)).toBeGreaterThan(0);
});
