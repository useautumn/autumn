import { afterAll, expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	ApiVersionClass,
	ErrCode,
	ms,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	getRedisTrackFeatureIdempotencyKey,
	TRACK_V3_IDEMPOTENCY_TTL_MS,
} from "@/internal/balances/idempotency/trackQueueIdempotency.js";
import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import {
	buildCustomerMeteredScenario,
	buildCustomerTwoMeteredScenario,
} from "../../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../../../db/full-subject/utils/withInsertedScenario.js";

// Scenario tests all run on V2_1 — pinned once at module scope (restored
// in afterAll) so tests can run concurrently without racing per-test
// mutation of the shared ctx.
const originalApiVersion = ctx.apiVersion;
ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_1);
afterAll(() => {
	ctx.apiVersion = originalApiVersion;
});

test.concurrent(
	"track-v3 idempotency is atomic for single-feature requests",
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "track-v3-idempotency",
		});
		const idempotencyKey = `track-v3-idem-${Date.now().toString(36)}`;
		const body = {
			customer_id: scenario.ids.customerId,
			feature_id: TestFeature.Messages,
			value: 25.5,
			idempotency_key: idempotencyKey,
		};

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const featureDeductions = getTrackFeatureDeductionsForBody({
					ctx,
					body,
				});

				const response = await runTrackV3({
					ctx,
					body,
					featureDeductions,
					apiVersion: ApiVersion.V2_1,
				});
				expect(response.balance).toMatchObject({
					feature_id: TestFeature.Messages,
					remaining: new Decimal(87).sub(body.value).toNumber(),
				});

				await expect(
					runTrackV3({
						ctx,
						body,
						featureDeductions,
						apiVersion: ApiVersion.V2_1,
					}),
				).rejects.toMatchObject({
					code: ErrCode.DuplicateIdempotencyKey,
					statusCode: 409,
				});

				const { redisKey } = getRedisTrackFeatureIdempotencyKey({
					ctx,
					customerId: body.customer_id,
					featureId: TestFeature.Messages,
				});
				expect(await ctx.redisV2.exists(redisKey)).toBe(1);
				const ttlMs = await ctx.redisV2.pttl(redisKey);
				expect(ttlMs).toBeGreaterThan(ms.hours(23));
				expect(ttlMs).toBeLessThanOrEqual(TRACK_V3_IDEMPOTENCY_TTL_MS);
			},
		});
	},
);

// ── End-to-end: async tracks validate the body key at accept time ────────────
//
// The body idempotency key is claimed on the request path for async tracks
// too: the first request is accepted and enqueued, the duplicate is rejected
// with 409 at accept (never reaching SQS), and exactly one deduction lands.

test.concurrent(
	`${chalk.yellowBright("track queue: duplicate async body idempotency key rejects at accept, deducts once")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { autumnV2_1, autumnV2_3, customerId } = await initScenario({
			customerId: "track-queue-idem-async",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const bodyKey = `queue-idem-${Date.now().toString(36)}`;
		const trackAsync = () =>
			autumnV2_3.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 3,
				async: true,
				idempotency_key: bodyKey,
			});

		await trackAsync();

		// Accept-time claim: the duplicate is rejected before it reaches SQS.
		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: trackAsync,
		});

		const sleep = (waitMs: number) =>
			new Promise((resolve) => setTimeout(resolve, waitMs));

		const balanceMatches = async (remaining: number) => {
			const customer =
				await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
			try {
				expectBalanceCorrect({
					customer,
					featureId: TestFeature.Messages,
					remaining,
				});
				return true;
			} catch {
				return false;
			}
		};

		// Wait for the worker to drain the message, then a short grace window to
		// catch any stray second deduction before the final assert.
		const deadline = Date.now() + 20_000;
		while (Date.now() < deadline && !(await balanceMatches(17))) {
			await sleep(500);
		}
		await sleep(2_000);

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 17,
		});
	},
);

// ── Queue replay dedup (the Lua key layer), redelivery-shaped ────────────────

test.concurrent(
	"worker redelivery with the same request id deducts once",
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "track-queue-redelivery",
		});
		const body = {
			customer_id: scenario.ids.customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		};

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				// First delivery — deducts 87 → 77.
				await runQueuedTrack({
					ctx,
					body,
					validateTrackBodyIdempotencyKey: false,
				});

				// SQS redelivery: same message, same ctx.id → silent no-op.
				await expect(
					runQueuedTrack({
						ctx,
						body,
						validateTrackBodyIdempotencyKey: false,
					}),
				).resolves.toBeUndefined();

				// A fresh request id sees exactly ONE prior deduction: 77 - 1 = 76.
				const verifyCtx = {
					...ctx,
					id: `${ctx.id}-redelivery-verify`,
				} as typeof ctx;
				const verifyBody = { ...body, value: 1 };
				const response = await runTrackV3({
					ctx: verifyCtx,
					body: verifyBody,
					featureDeductions: getTrackFeatureDeductionsForBody({
						ctx: verifyCtx,
						body: verifyBody,
					}),
					apiVersion: ApiVersion.V2_1,
				});
				expect(response.balance).toMatchObject({
					feature_id: TestFeature.Messages,
					remaining: 76,
				});

				const { redisKey } = getRedisTrackFeatureIdempotencyKey({
					ctx,
					customerId: body.customer_id,
					featureId: TestFeature.Messages,
				});
				expect(await ctx.redisV2.exists(redisKey)).toBe(1);
			},
		});
	},
);

test.concurrent(
	"distinct request ids are never deduped against each other",
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "track-queue-distinct-ids",
		});
		const body = {
			customer_id: scenario.ids.customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		};

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const trackWithRequestId = async (requestId: string) => {
					const requestCtx = { ...ctx, id: requestId } as typeof ctx;
					return runTrackV3({
						ctx: requestCtx,
						body,
						featureDeductions: getTrackFeatureDeductionsForBody({
							ctx: requestCtx,
							body,
						}),
						apiVersion: ApiVersion.V2_1,
					});
				};

				const first = await trackWithRequestId(`${ctx.id}-distinct-a`);
				expect(first.balance).toMatchObject({ remaining: 82 });

				const second = await trackWithRequestId(`${ctx.id}-distinct-b`);
				expect(second.balance).toMatchObject({ remaining: 77 });
			},
		});
	},
);

test.concurrent("the same request id is scoped per customer", async () => {
	const scenarioA = buildCustomerMeteredScenario({
		ctx,
		name: "track-queue-cus-scope-a",
	});
	const scenarioB = buildCustomerMeteredScenario({
		ctx,
		name: "track-queue-cus-scope-b",
	});

	await withInsertedScenario({
		ctx,
		scenario: scenarioA,
		run: async () => {
			await withInsertedScenario({
				ctx,
				scenario: scenarioB,
				run: async () => {
					// Same ctx.id for both customers — keys are customer-scoped,
					// so neither deduction blocks the other.
					const trackFor = async (customerId: string) => {
						const body = {
							customer_id: customerId,
							feature_id: TestFeature.Messages,
							value: 5,
						};
						return runTrackV3({
							ctx,
							body,
							featureDeductions: getTrackFeatureDeductionsForBody({
								ctx,
								body,
							}),
							apiVersion: ApiVersion.V2_1,
						});
					};

					const first = await trackFor(scenarioA.ids.customerId);
					expect(first.balance).toMatchObject({ remaining: 82 });

					const second = await trackFor(scenarioB.ids.customerId);
					expect(second.balance).toMatchObject({ remaining: 82 });
				},
			});
		},
	});
});

// ── Multi-feature deduction: per-feature keys, skip-and-continue ─────────────
//
// Contract (agreed 2026-08-03):
//   A. A duplicate feature is SKIPPED and the remaining features still deduct
//      (partial replays resume instead of aborting).
//   B. A fully-duplicate replay surfaces DuplicateIdempotencyKey, which
//      runQueuedTrack swallows — the job is acked, never requeued.

test.concurrent(
	"multi-feature: duplicate features are skipped, remaining features still deduct",
	async () => {
		const scenario = buildCustomerTwoMeteredScenario({
			ctx,
			name: "track-queue-multi-feature",
		});
		const customerId = scenario.ids.customerId;

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const bodyMessages = {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 10,
				};
				const bodyUsers = {
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 5,
				};
				const buildMultiDeductions = (requestCtx: typeof ctx) => [
					...getTrackFeatureDeductionsForBody({
						ctx: requestCtx,
						body: bodyMessages,
					}),
					...getTrackFeatureDeductionsForBody({
						ctx: requestCtx,
						body: bodyUsers,
					}),
				];

				// 1. Full multi-feature deduction: messages 87→77, users 50→45.
				const ctxA = { ...ctx, id: `${ctx.id}-multi-a` } as typeof ctx;
				await runTrackV3({
					ctx: ctxA,
					body: bodyMessages,
					featureDeductions: buildMultiDeductions(ctxA),
					apiVersion: ApiVersion.V2_1,
				});

				// 2. PARTIAL replay (contract A): a fresh request id whose messages
				//    key is already set — messages is skipped, users still deducts
				//    (users 45→40), and the call resolves instead of aborting.
				const ctxB = { ...ctx, id: `${ctx.id}-multi-b` } as typeof ctx;
				const { redisKey: appliedMessagesKey } =
					getRedisTrackFeatureIdempotencyKey({
						ctx: ctxB,
						customerId,
						featureId: TestFeature.Messages,
					});
				await ctx.redisV2.set(
					appliedMessagesKey,
					"1",
					"PX",
					TRACK_V3_IDEMPOTENCY_TTL_MS,
				);

				await expect(
					runTrackV3({
						ctx: ctxB,
						body: bodyMessages,
						featureDeductions: buildMultiDeductions(ctxB),
						apiVersion: ApiVersion.V2_1,
					}),
				).resolves.toBeDefined();

				// 3. FULL replay of ctxB (every key set) → DuplicateIdempotencyKey…
				await expect(
					runTrackV3({
						ctx: ctxB,
						body: bodyMessages,
						featureDeductions: buildMultiDeductions(ctxB),
						apiVersion: ApiVersion.V2_1,
					}),
				).rejects.toMatchObject({
					code: ErrCode.DuplicateIdempotencyKey,
					statusCode: 409,
				});

				// …which the worker swallows (contract B): resolves → acked, not requeued.
				await expect(
					runQueuedTrack({
						ctx: ctxB,
						body: bodyMessages,
						validateTrackBodyIdempotencyKey: false,
					}),
				).resolves.toBeUndefined();

				// 4. Balance proof via fresh request ids: messages deducted ONCE
				//    (77 - 1 = 76), users deducted TWICE (40 - 1 = 39).
				const verifyCtx = {
					...ctx,
					id: `${ctx.id}-multi-verify`,
				} as typeof ctx;
				const verifyMessages = { ...bodyMessages, value: 1 };
				const messagesResponse = await runTrackV3({
					ctx: verifyCtx,
					body: verifyMessages,
					featureDeductions: getTrackFeatureDeductionsForBody({
						ctx: verifyCtx,
						body: verifyMessages,
					}),
					apiVersion: ApiVersion.V2_1,
				});
				expect(messagesResponse.balance).toMatchObject({
					feature_id: TestFeature.Messages,
					remaining: 76,
				});

				const verifyUsers = { ...bodyUsers, value: 1 };
				const usersResponse = await runTrackV3({
					ctx: verifyCtx,
					body: verifyUsers,
					featureDeductions: getTrackFeatureDeductionsForBody({
						ctx: verifyCtx,
						body: verifyUsers,
					}),
					apiVersion: ApiVersion.V2_1,
				});
				expect(usersResponse.balance).toMatchObject({
					feature_id: TestFeature.Users,
					remaining: 39,
				});
			},
		});
	},
);
