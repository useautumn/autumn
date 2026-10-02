/**
 * Asserts the server honors the edge-config rate-limit override, lowered for a
 * throwaway sub-org through the admin route, by firing more requests than it allows.
 */

import { afterEach, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";

const testCase = "rate-limit-overrides";

const ENTITIES_GET_OVERRIDE_LIMIT = 5;
const REQUEST_COUNT = ENTITIES_GET_OVERRIDE_LIMIT * 3;

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

const setupSubOrgWithEntity = async ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string;
}) => {
	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				name: "Rate limit overrides",
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
		],
		actions: [],
	});

	await autumnV1.entities.create(customerId, {
		id: entityId,
		name: "Rate Limit Override Entity",
		feature_id: TestFeature.Users,
	});

	return { ctx };
};

const fireEntitiesGet = ({
	secretKey,
	customerId,
	entityId,
}: {
	secretKey: string;
	customerId: string;
	entityId: string;
}) => {
	const client = new AutumnInt({ version: ApiVersion.V1_2, secretKey });
	return Promise.allSettled(
		Array.from({ length: REQUEST_COUNT }, () =>
			client.post("/entities.get", {
				customer_id: customerId,
				entity_id: entityId,
			}),
		),
	);
};

test(`${chalk.yellowBright(`${testCase}: override lowers effective limit for the org`)}`, async () => {
	const customerId = "rate-limit-override-lower";
	const entityId = "entity-rate-limit-override";
	const { ctx } = await setupSubOrgWithEntity({ customerId, entityId });

	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: ctx.org.id,
		limits: {
			[RateLimitType.CustomerEntitiesGet]: ENTITIES_GET_OVERRIDE_LIMIT,
		},
	}));

	const results = await fireEntitiesGet({
		secretKey: ctx.orgSecretKey,
		customerId,
		entityId,
	});

	expect(countRateLimited(results)).toBeGreaterThan(0);
});

test(`${chalk.yellowBright(`${testCase}: orgSlug fallback resolves the override`)}`, async () => {
	const customerId = "rate-limit-override-slug";
	const entityId = "entity-rate-limit-slug";
	const { ctx } = await setupSubOrgWithEntity({ customerId, entityId });

	const slug = ctx.org.slug;
	if (!slug) throw new Error("test sub-org has no slug");

	({ restore: restoreOverride } = await setServerRateLimitOverride({
		ctx,
		orgKey: slug,
		limits: {
			[RateLimitType.CustomerEntitiesGet]: ENTITIES_GET_OVERRIDE_LIMIT,
		},
	}));

	const results = await fireEntitiesGet({
		secretKey: ctx.orgSecretKey,
		customerId,
		entityId,
	});

	expect(countRateLimited(results)).toBeGreaterThan(0);
});
