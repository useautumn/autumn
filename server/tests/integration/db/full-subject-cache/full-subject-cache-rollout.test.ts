import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import {
	buildFullSubjectKey,
	getCachedFullSubject,
	setCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";
import { buildCustomerMeteredScenario } from "../full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../full-subject/utils/withInsertedScenario.js";

const findCustomerIdInChangedBucket = ({
	prefix,
	min,
	max,
}: {
	prefix: string;
	min: number;
	max: number;
}) => {
	for (let i = 0; i < 10000; i++) {
		const customerId = `${prefix}-${i}`;
		const bucket = getCustomerBucket({ customerId });
		if (bucket >= min && bucket < max) return customerId;
	}

	throw new Error(`No customer found in range [${min}, ${max})`);
};

describe(`${chalk.yellowBright("fullSubject cache rollout staleness")}`, () => {
	test("stale subject is evicted when rollout routing changes", async () => {
		const customerId = findCustomerIdInChangedBucket({
			prefix: "fullsubject-rollout",
			min: 20,
			max: 50,
		});
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: customerId,
		});
		scenario.customer.id = customerId;
		scenario.ids.customerId = customerId;

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const normalized = await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				});
				expect(normalized).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchTimeMs: Date.now(),
					fetchedSubjectViewEpoch: 0,
				});
				expect(result).toBe("OK");

				ctx.rolloutSnapshot = {
					customerBucket: getCustomerBucket({ customerId }),
					rolloutId: "v2-cache",
					enabled: true,
					percent: 50,
					previousPercent: 20,
					changedAt: Date.now() + 1000,
				};

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();

				const subjectExists = await redisV2.get(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				expect(subjectExists ?? null).toBeNull();
				ctx.rolloutSnapshot = undefined;
			},
		});
	});
});
