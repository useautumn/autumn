import { afterEach, describe, expect, test } from "bun:test";
import { normalizedToFullSubject } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { getOrInitFullSubjectViewEpoch } from "@/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch.js";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import {
	buildFullSubjectGuardKey,
	buildFullSubjectKey,
	buildFullSubjectReserveKey,
	buildFullSubjectViewEpochKey,
	buildSharedFullSubjectBalanceKey,
	getCachedFullSubject,
	getCachedPartialFullSubject,
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
		buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		}),
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
				buildSharedFullSubjectBalanceKey({
					orgId: ctx.org.id,
					env: ctx.env,
					customerId,
					featureId,
				}),
			);
		}
	}

	await redisV2.del(...keys);
};

afterEach(async () => {});

const getCurrentViewEpoch = async ({ customerId }: { customerId: string }) =>
	getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});

const getSharedBalanceHash = async ({
	customerId,
	featureId,
}: {
	customerId: string;
	featureId: string;
}) =>
	redisV2.hgetall(
		buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId,
		}),
	);

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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");

				const subjectRaw = await redisV2.get(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);
				const cachedSubject = JSON.parse(
					subjectRaw as string,
				) as CachedFullSubject;
				expect(cachedSubject.subjectViewEpoch).toBe(0);

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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");
				const subjectRaw = await redisV2.get(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
						entityId,
					}),
				);
				const cachedSubject = JSON.parse(
					subjectRaw as string,
				) as CachedFullSubject;
				expect(cachedSubject.subjectViewEpoch).toBe(0);

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

	test("entity cache fill preserves existing shared balance fields and never creates a meta key", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-cache-shared-balance-upsert",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const customerId = scenario.ids.customerId;
				const entityId = scenario.ids.entityIds[0]!;
				const customerNormalized = await getFullSubjectNormalized({
					ctx,
					customerId,
				});
				const entityNormalized = await getFullSubjectNormalized({
					ctx,
					customerId,
					entityId,
				});

				expect(customerNormalized).toBeDefined();
				expect(entityNormalized).toBeDefined();

				const overlappingFeatureId =
					entityNormalized!.customer_entitlements.find((entityCusEnt) =>
						customerNormalized!.customer_entitlements.some(
							(customerCusEnt) => customerCusEnt.id === entityCusEnt.id,
						),
					)?.feature_id;

				expect(overlappingFeatureId).toBeDefined();

				const fetchedSubjectViewEpoch = await getCurrentViewEpoch({
					customerId,
				});

				expect(
					await setCachedFullSubject({
						ctx,
						normalized: customerNormalized!,
						fetchTimeMs: Date.now(),
						fetchedSubjectViewEpoch,
					}),
				).toBe("OK");

				const hashBeforeEntityWrite = await getSharedBalanceHash({
					customerId,
					featureId: overlappingFeatureId!,
				});

				expect(Object.keys(hashBeforeEntityWrite).length).toBeGreaterThan(0);
				expect(
					await redisV2.exists(
						`{${customerId}}:${ctx.org.id}:${ctx.env}:full_subject:shared_balances`,
					),
				).toBe(0);

				expect(
					await setCachedFullSubject({
						ctx,
						normalized: entityNormalized!,
						fetchTimeMs: Date.now(),
						fetchedSubjectViewEpoch,
						overwrite: true,
					}),
				).toBe("OK");

				const hashAfterEntityWrite = await getSharedBalanceHash({
					customerId,
					featureId: overlappingFeatureId!,
				});

				for (const [field, value] of Object.entries(hashBeforeEntityWrite)) {
					expect(hashAfterEntityWrite[field]).toBe(value);
				}

				expect(
					await redisV2.exists(
						`{${customerId}}:${ctx.org.id}:${ctx.env}:full_subject:shared_balances`,
					),
				).toBe(0);

				await cleanupKeys({ customerId });
				await cleanupKeys({ customerId, entityId });
			},
		});
	});

	test("entity subject cache misses when subject view epoch changes", async () => {
		const scenario = buildEntitySubjectScenario({
			ctx,
			name: "fullsubject-cache-stale-entity-epoch",
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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");

				await redisV2.incr(
					buildFullSubjectViewEpochKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				const cached = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
					source: "integration-test",
				});
				const partialCached = await getCachedPartialFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
					featureIds: ["messages", "users"],
					source: "integration-test",
				});

				expect(cached).toBeUndefined();
				expect(partialCached).toBeUndefined();

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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
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
					buildSharedFullSubjectBalanceKey({
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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
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
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
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
