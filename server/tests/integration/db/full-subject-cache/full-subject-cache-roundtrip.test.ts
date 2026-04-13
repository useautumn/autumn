import { afterEach, describe, expect, test } from "bun:test";
import { normalizedToFullSubject } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import {
	buildFullSubjectBalanceKey,
	buildFullSubjectGuardKey,
	buildFullSubjectKey,
	buildFullSubjectReserveKey,
	getCachedFullSubject,
	invalidateCachedFullSubject,
	setCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { fullSubjectToComparableSubject } from "../full-subject/utils/buildComparableFullSubject.js";
import {
	buildCustomerMeteredScenario,
	buildCustomerWithInvoicesAndSubscriptionsScenario,
	buildEntitySubjectScenario,
} from "../full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../full-subject/utils/withInsertedScenario.js";

const cleanupKeys = async ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId?: string;
}) => {
	const subjectKey = buildFullSubjectKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		entityId,
	});
	const subjectRaw = (await redisV2.get(subjectKey)) as string | null;
	const keys = [
		subjectKey,
		buildFullSubjectReserveKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			entityId,
		}),
		buildFullSubjectGuardKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			entityId,
		}),
	];

	if (subjectRaw) {
		const subject = JSON.parse(subjectRaw) as CachedFullSubject;
		for (const featureId of subject.meteredFeatures) {
			keys.push(
				buildFullSubjectBalanceKey({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId,
					entityId,
					featureId,
				}),
			);
		}
	}

	await redisV2.del(...keys);
};

afterEach(async () => {});

describe(`${chalk.yellowBright("fullSubject cache roundtrip")}`, () => {
	test("customer subject round-trips through cache", async () => {
		const scenario = buildCustomerWithInvoicesAndSubscriptionsScenario({
			ctx,
			name: "fullsubject-cache-roundtrip-customer",
		});

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
				});
				expect(result).toBe("OK");

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(
					fullSubjectToComparableSubject({
						fullSubject: cached!,
					}),
				).toEqual(
					fullSubjectToComparableSubject({
						fullSubject: normalizedToFullSubject({ normalized: normalized! }),
					}),
				);

				await cleanupKeys({ customerId: scenario.ids.customerId });
			},
		});
	});

	test("entity subject round-trips through cache", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-cache-roundtrip-entity",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const entityId = scenario.ids.entityIds[0]!;
				const normalized = await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
				});
				expect(normalized).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchTimeMs: Date.now(),
				});
				expect(result).toBe("OK");

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
					source: "integration-test",
				});

				expect(
					fullSubjectToComparableSubject({
						fullSubject: cached!,
					}),
				).toEqual(
					fullSubjectToComparableSubject({
						fullSubject: normalizedToFullSubject({ normalized: normalized! }),
					}),
				);

				await cleanupKeys({
					customerId: scenario.ids.customerId,
					entityId,
				});
			},
		});
	});

	test("missing balance hash returns cache miss", async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "fullsubject-cache-missing-balance",
		});

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
				});
				expect(result).toBe("OK");

				const subjectKey = buildFullSubjectKey({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: scenario.ids.customerId,
				});
				const subjectRaw = (await redisV2.get(subjectKey)) as string | null;
				const subject = JSON.parse(subjectRaw!) as CachedFullSubject;

				await redisV2.del(
					buildFullSubjectBalanceKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
						featureId: subject.meteredFeatures[0]!,
					}),
				);

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();
				await cleanupKeys({ customerId: scenario.ids.customerId });
			},
		});
	});

	test("missing top-level subject returns cache miss", async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "fullsubject-cache-missing-subject",
		});

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
				});
				expect(result).toBe("OK");

				await redisV2.del(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();
			},
		});
	});

	test("invalidation removes subject and makes cache unreadable", async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "fullsubject-cache-invalidation",
		});

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
				});
				expect(result).toBe("OK");

				await invalidateCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();
			},
		});
	});

	test("existing subject skips write when overwrite is false", async () => {
		const scenario = buildCustomerWithInvoicesAndSubscriptionsScenario({
			ctx,
			name: "fullsubject-cache-skip-existing",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const normalized = await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				});
				expect(normalized).toBeDefined();

				const firstResult = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchTimeMs: Date.now(),
				});
				expect(firstResult).toBe("OK");

				const subjectKey = buildFullSubjectKey({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: scenario.ids.customerId,
				});
				const firstSubjectRaw = (await redisV2.get(subjectKey)) as
					| string
					| null;
				expect(firstSubjectRaw).toBeDefined();

				const secondResult = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchTimeMs: Date.now(),
				});
				expect(secondResult).toBe("CACHE_EXISTS");

				const secondSubjectRaw = (await redisV2.get(subjectKey)) as
					| string
					| null;
				expect(secondSubjectRaw).toEqual(firstSubjectRaw);

				await cleanupKeys({ customerId: scenario.ids.customerId });
			},
		});
	});
});
