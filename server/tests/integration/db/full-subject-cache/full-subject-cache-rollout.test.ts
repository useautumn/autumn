import { describe, expect, test } from "bun:test";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import {
	buildFullSubjectKey,
	getCachedFullSubject,
	setCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import {
	ACTIVE_ROLLOUT_ID,
	getCustomerBucket,
	ROLLOUT_SETTLE_MS,
} from "@/internal/misc/rollouts/rolloutUtils.js";
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
				const fetchResult = await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				});
				expect(fetchResult).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: fetchResult!.normalized,
					fetchedSubjectViewEpoch: 0,
				});
				expect(result).toBe("OK");

				// Rolled back from 50 to 20 a second past settling: this bucket left the worker,
				// so the view written just above predates its return and must go.
				const rolledBackAt = Date.now() - ROLLOUT_SETTLE_MS - 1000;
				_setRolloutConfigForTesting({
					config: {
						rollouts: {
							[ACTIVE_ROLLOUT_ID]: {
								percent: 20,
								previousPercent: 50,
								changedAt: rolledBackAt,
								decreases: [{ from: 50, to: 20, at: rolledBackAt }],
								orgs: {},
							},
						},
					},
				});

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();

				const subjectExists = await ctx.redisV2.get(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				expect(subjectExists ?? null).toBeNull();
				_setRolloutConfigForTesting({ config: { rollouts: {} } });
			},
		});
	});
});
