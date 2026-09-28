/**
 * Batch-item redelivery safety. A batch item is one SQS message processed by
 * runQueuedTrack with a per-item requestId (`${ctx.id}-${index}`) and
 * validateTrackBodyIdempotencyKey: true. SQS is at-least-once, so the SAME
 * message can be delivered twice — these tests re-run runQueuedTrack with the
 * identical payload, which IS a redelivery.
 *
 * Contract under test:
 *   - Keyed item: the redelivery is dropped by the worker's body-key claim.
 *   - Unkeyed item: the redelivery is dropped by the Lua replay keys (seeded
 *     by the per-item request id) — and is swallowed, never requeued.
 *   - Per-item seeds are isolated: two items with identical multi-feature
 *     deductions both apply, while a redelivery of ONE item applies nothing.
 */

import { afterAll, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { runQueuedTrack } from "@/internal/balances/track/runQueuedTrack.js";
import { getTrackFeatureDeductionsForBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { runTrackV3 } from "@/internal/balances/track/v3/runTrackV3.js";
import {
	buildCustomerMeteredScenario,
	buildCustomerTwoMeteredScenario,
} from "../../../db/full-subject/utils/fullSubjectScenarioBuilders.js";
import { withInsertedScenario } from "../../../db/full-subject/utils/withInsertedScenario.js";

const originalApiVersion = ctx.apiVersion;
ctx.apiVersion = new ApiVersionClass(ApiVersion.V2_1);
afterAll(() => {
	ctx.apiVersion = originalApiVersion;
});

/** Deducts 1 with a fresh request id and returns the remaining balance —
 *  proves how many prior deductions actually landed. */
const verifyRemaining = async ({
	customerId,
	featureId,
	verifyId,
}: {
	customerId: string;
	featureId: TestFeature;
	verifyId: string;
}) => {
	const verifyCtx = { ...ctx, id: verifyId } as typeof ctx;
	const body = { customer_id: customerId, feature_id: featureId, value: 1 };
	const response = await runTrackV3({
		ctx: verifyCtx,
		body,
		featureDeductions: getTrackFeatureDeductionsForBody({
			ctx: verifyCtx,
			body,
		}),
		apiVersion: ApiVersion.V2_1,
	});
	return (response.balance as { remaining: number }).remaining;
};

test.concurrent(
	"redelivered KEYED batch item deducts once (body-key claim drops it)",
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "batch-redelivery-keyed",
		});
		const customerId = scenario.ids.customerId;

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const itemCtx = { ...ctx, id: `${ctx.id}-bt-keyed-0` } as typeof ctx;
				const body = {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 10,
					idempotency_key: `bt-keyed-${Date.now().toString(36)}`,
				};

				// First delivery: claims the body key, deducts 87 → 77.
				await runQueuedTrack({
					ctx: itemCtx,
					body,
					validateTrackBodyIdempotencyKey: true,
				});

				// Redelivery of the SAME message → duplicate body-key claim →
				// swallowed (acked, not requeued), nothing deducted.
				await expect(
					runQueuedTrack({
						ctx: itemCtx,
						body,
						validateTrackBodyIdempotencyKey: true,
					}),
				).resolves.toBeUndefined();

				expect(
					await verifyRemaining({
						customerId,
						featureId: TestFeature.Messages,
						verifyId: `${ctx.id}-bt-keyed-verify`,
					}),
				).toBe(76);
			},
		});
	},
);

test.concurrent(
	"redelivered UNKEYED batch item deducts once (Lua replay keys drop it)",
	async () => {
		const scenario = buildCustomerMeteredScenario({
			ctx,
			name: "batch-redelivery-unkeyed",
		});
		const customerId = scenario.ids.customerId;

		await withInsertedScenario({
			ctx,
			scenario,
			run: async () => {
				const itemCtx = { ...ctx, id: `${ctx.id}-bt-unkeyed-0` } as typeof ctx;
				const body = {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 10,
				};

				await runQueuedTrack({
					ctx: itemCtx,
					body,
					validateTrackBodyIdempotencyKey: true,
				});

				// No body key — the per-item request id's Lua key is the only
				// guard, and it must both drop the deduction AND be swallowed.
				await expect(
					runQueuedTrack({
						ctx: itemCtx,
						body,
						validateTrackBodyIdempotencyKey: true,
					}),
				).resolves.toBeUndefined();

				expect(
					await verifyRemaining({
						customerId,
						featureId: TestFeature.Messages,
						verifyId: `${ctx.id}-bt-unkeyed-verify`,
					}),
				).toBe(76);
			},
		});
	},
);

test.concurrent(
	"per-item seeds are isolated: identical multi-feature items both apply; redelivery of one applies nothing",
	async () => {
		const scenario = buildCustomerTwoMeteredScenario({
			ctx,
			name: "batch-redelivery-multi",
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
				const deliverItem = (itemId: string) => {
					const itemCtx = { ...ctx, id: itemId } as typeof ctx;
					return runTrackV3({
						ctx: itemCtx,
						body: bodyMessages,
						featureDeductions: [
							...getTrackFeatureDeductionsForBody({
								ctx: itemCtx,
								body: bodyMessages,
							}),
							...getTrackFeatureDeductionsForBody({
								ctx: itemCtx,
								body: bodyUsers,
							}),
						],
						apiVersion: ApiVersion.V2_1,
					});
				};

				// Items 0 and 1: identical deductions, distinct per-item seeds —
				// BOTH apply. messages 87→67, users 50→40.
				await deliverItem(`${ctx.id}-bt-multi-0`);
				await deliverItem(`${ctx.id}-bt-multi-1`);

				// Redelivery of item 0: every feature is a duplicate → 409 from
				// the deduction layer…
				await expect(deliverItem(`${ctx.id}-bt-multi-0`)).rejects.toMatchObject(
					{
						statusCode: 409,
					},
				);

				// …which the worker swallows (single-feature body derivation) —
				// acked, not requeued.
				await expect(
					runQueuedTrack({
						ctx: { ...ctx, id: `${ctx.id}-bt-multi-0` } as typeof ctx,
						body: bodyMessages,
						validateTrackBodyIdempotencyKey: true,
					}),
				).resolves.toBeUndefined();

				expect(
					await verifyRemaining({
						customerId,
						featureId: TestFeature.Messages,
						verifyId: `${ctx.id}-bt-multi-verify-m`,
					}),
				).toBe(66);
				expect(
					await verifyRemaining({
						customerId,
						featureId: TestFeature.Users,
						verifyId: `${ctx.id}-bt-multi-verify-u`,
					}),
				).toBe(39);
			},
		});
	},
);
