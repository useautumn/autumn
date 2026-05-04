import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, normalizedToFullSubject } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { getOrInitFullSubjectViewEpoch } from "@/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch.js";
import type { CachedFullSubject } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { sanitizeCachedFullSubject } from "@/internal/customers/cache/fullSubject/sanitize/sanitizeCachedFullSubject.js";
import {
	buildFullSubjectKey,
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
	const subjectRaw = (await ctx.redisV2.get(subjectKey)) as string | null;
	const keys = [
		subjectKey,
		buildFullSubjectViewEpochKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
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

	await ctx.redisV2.del(...keys);
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
	ctx.redisV2.hgetall(
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				expect(normalized).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");

				const subjectRaw = await ctx.redisV2.get(
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

				const { fullSubject: cached } = await getCachedFullSubject({
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
				}))!;
				expect(normalized).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");
				const subjectRaw = await ctx.redisV2.get(
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

				const { fullSubject: cached } = await getCachedFullSubject({
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
				const { normalized: customerNormalized } =
					(await getFullSubjectNormalized({
						ctx,
						customerId,
					}))!;
				const { normalized: entityNormalized } =
					(await getFullSubjectNormalized({
						ctx,
						customerId,
						entityId,
					}))!;

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
						fetchedSubjectViewEpoch,
					}),
				).toBe("OK");

				const hashBeforeEntityWrite = await getSharedBalanceHash({
					customerId,
					featureId: overlappingFeatureId!,
				});

				expect(Object.keys(hashBeforeEntityWrite).length).toBeGreaterThan(0);
				expect(
					await ctx.redisV2.exists(
						`{${customerId}}:${ctx.org.id}:${ctx.env}:full_subject:shared_balances`,
					),
				).toBe(0);

				await invalidateCachedFullSubject({
					ctx,
					customerId,
					source: "integration-test-overwrite",
				});

				expect(
					await setCachedFullSubject({
						ctx,
						normalized: entityNormalized!,
						fetchedSubjectViewEpoch: await getCurrentViewEpoch({
							customerId,
						}),
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
					await ctx.redisV2.exists(
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
				}))!;
				expect(normalized).toBeDefined();

				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");

				await ctx.redisV2.incr(
					buildFullSubjectViewEpochKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				const { fullSubject: cached } = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					entityId,
					source: "integration-test",
				});
				const { fullSubject: partialCached } = await getCachedPartialFullSubject({
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				expect(normalized).toBeDefined();
				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
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
				const subjectRaw = (await ctx.redisV2.get(subjectKey)) as string | null;
				const subject = JSON.parse(subjectRaw!) as CachedFullSubject;

				await ctx.redisV2.del(
					buildSharedFullSubjectBalanceKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
						featureId: subject.meteredFeatures[0]!,
					}),
				);

				const { fullSubject: cached } = await getCachedFullSubject({
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				expect(normalized).toBeDefined();
				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(result).toBe("OK");

				await ctx.redisV2.del(
					buildFullSubjectKey({
						orgId: ctx.org.id,
						env: ctx.env,
						customerId: scenario.ids.customerId,
					}),
				);

				const { fullSubject: cached } = await getCachedFullSubject({
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
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				expect(normalized).toBeDefined();
				const result = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
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

				const { fullSubject: cached } = await getCachedFullSubject({
					ctx,
					customerId: scenario.ids.customerId,
					source: "integration-test",
				});

				expect(cached).toBeUndefined();
			},
		});
	});

	test("existing subject skips write (CACHE_EXISTS)", async () => {
		const scenario = buildCustomerWithInvoicesAndSubscriptionsScenario({
			ctx,
			name: "fullsubject-cache-skip-existing",
		});

		await withInsertedScenario({
			ctx,
			scenario,
			run: async ({ scenario }) => {
				const { normalized } = (await getFullSubjectNormalized({
					ctx,
					customerId: scenario.ids.customerId,
				}))!;
				expect(normalized).toBeDefined();

				const firstResult = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
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
				const firstSubjectRaw = (await ctx.redisV2.get(subjectKey)) as
					| string
					| null;
				expect(firstSubjectRaw).toBeDefined();

				const secondResult = await setCachedFullSubject({
					ctx,
					normalized: normalized!,
					fetchedSubjectViewEpoch: await getCurrentViewEpoch({
						customerId: scenario.ids.customerId,
					}),
				});
				expect(secondResult).toBe("CACHE_EXISTS");

				const secondSubjectRaw = (await ctx.redisV2.get(subjectKey)) as
					| string
					| null;
				expect(secondSubjectRaw).toEqual(firstSubjectRaw);

				await cleanupKeys({ customerId: scenario.ids.customerId });
			},
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// Commit ce100dbf — cache sanitization regression
	//
	// Upstash's Lua cjson collapses empty `{}` to `[]` on round-trip. Without
	// the sanitizer, a cached `product.config` written as `{}` comes back as
	// `[]` and downstream consumers throw "Expected object, received array".
	// ─────────────────────────────────────────────────────────────────────────
	test(`${chalk.yellowBright("redis round-trip — cached product.config:[] is sanitized to {} on read")}`, async () => {
		const planId = "plan_sanitize_redis_roundtrip";
		const cacheKey = `tests:cache-sanitize-roundtrip:${planId}:${Date.now()}`;
		const malformedCacheEntry: unknown = {
			subjectType: "customer",
			customerId: "cus_sanitize_redis",
			internalCustomerId: "cus_int_sanitize_redis",
			_cachedAt: Date.now(),
			subjectViewEpoch: 0,
			meteredFeatures: [],
			customerEntitlementIdsByFeatureId: {},
			customer: {
				internal_id: "cus_int_sanitize_redis",
				org_id: ctx.org.id,
				env: AppEnv.Live,
				created_at: 1,
			},
			customer_products: [],
			products: [
				{
					id: planId,
					internal_id: `ip_${planId}`,
					name: planId,
					group: `grp_${planId}`,
					created_at: 1,
					env: ctx.env,
					org_id: ctx.org.id,
					is_add_on: false,
					is_default: false,
					version: 1,
					archived: false,
					config: [], // <-- this is what Upstash hands back for `{}`
				},
			],
			entitlements: [],
			prices: [],
			free_trials: [],
			subscriptions: [],
			invoices: [],
			flags: {},
		};

		try {
			await ctx.redisV2.set(cacheKey, JSON.stringify(malformedCacheEntry));
			const raw = await ctx.redisV2.get(cacheKey);
			expect(raw).toBeDefined();
			const parsed = JSON.parse(raw as string) as CachedFullSubject;

			// Pre-condition: the on-wire payload really does contain the bug
			// shape we're guarding against.
			expect(
				Array.isArray(
					(parsed.products[0] as unknown as { config: unknown }).config,
				),
			).toBe(true);

			const sanitized = sanitizeCachedFullSubject({
				cachedFullSubject: parsed,
			});
			const product = sanitized.products[0] as unknown as {
				config: { ignore_past_due: boolean };
			};

			expect(Array.isArray(product.config)).toBe(false);
			expect(product.config.ignore_past_due).toBe(false);
		} finally {
			await ctx.redisV2.del(cacheKey);
		}
	});
});
