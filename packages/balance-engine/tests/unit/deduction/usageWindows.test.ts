import { describe, expect, test } from "bun:test";
import {
	EntInterval,
	FeatureType,
	getUsageWindowBounds,
	ResetInterval,
} from "@autumn/shared";
import type {
	WorkerCustomer,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import {
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import {
	createDeductionRequest,
	customerWith,
	type DeductionOutcome,
	deductFrom,
} from "./deductionFixtures.js";

const dailyCap = ({
	limit,
	filter,
	featureId = "messages",
}: {
	limit: number;
	filter?: { properties: Record<string, string> };
	featureId?: string;
}): WorkerCustomer =>
	customerWith({
		usage_limits: [
			{
				feature_id: featureId,
				enabled: true,
				limit,
				interval: ResetInterval.Day,
				...(filter ? { filter } : {}),
			},
		],
	});
const today = getUsageWindowBounds({
	interval: EntInterval.Day,
	now: occurredAt,
});
const counterRow = ({
	usage,
	windowStartAt = today.windowStartAt,
	windowEndAt = today.windowEndAt,
}: {
	usage: number;
	windowStartAt?: number;
	windowEndAt?: number;
}): WorkerUsageWindow => ({
	id: "uw_existing",
	internal_customer_id: "cus_1",
	internal_entity_id: null,
	feature_id: "messages",
	internal_feature_id: "feat_messages",
	filter_key: null,
	anchor_customer_entitlement_id: null,
	window_start_at: windowStartAt,
	window_end_at: windowEndAt,
	usage,
	updated_at: occurredAt - 1,
});
const windowChangesOf = (outcome: DeductionOutcome) =>
	outcome.changes.filter((change) => change.table === "usageWindows");

describe("usage windows", () => {
	test.concurrent(
		"two customers with the same cap on the same day get counters of their own",
		() => {
			const counterIdFor = ({ internalId }: { internalId: string }) => {
				const outcome = deductFrom({
					customer: { ...dailyCap({ limit: 5 }), internal_id: internalId },
					customerEntitlements: [
						createCustomerEntitlement({ id: "a", balance: 10 }),
					],
					value: 1,
				});
				const [change] = windowChangesOf(outcome);
				return change?.op === "insert" ? change.row.id : undefined;
			};

			const first = counterIdFor({ internalId: "cus_1" });
			const second = counterIdFor({ internalId: "cus_2" });
			expect(first).toBeDefined();
			expect(second).toBeDefined();
			// A calendar-aligned window starts at the same instant for everyone, so the customer must be in the id.
			expect(first).not.toBe(second);
		},
	);

	test.concurrent(
		"a daily cap clamps the track across rows onto one new counter",
		() => {
			const outcome = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [
					createCustomerEntitlement({ id: "a", balance: 3 }),
					{
						...createCustomerEntitlement({ id: "b", balance: 10 }),
						created_at: occurredAt + 1,
					},
				],
				value: 10,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 5 });
			expect(windowChangesOf(outcome)).toMatchObject([
				{
					op: "insert",
					row: {
						feature_id: "messages",
						usage: 5,
						window_start_at: today.windowStartAt,
						window_end_at: today.windowEndAt,
						updated_at: occurredAt,
					},
				},
			]);
		},
	);

	test.concurrent(
		"a live counter leaves only its headroom; an expired one reads as zero",
		() => {
			const live = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				usageWindows: [counterRow({ usage: 4 })],
				value: 10,
			});
			expect(live).toMatchObject({ appliedValue: 1, remaining: 9 });
			expect(windowChangesOf(live)).toMatchObject([
				{
					op: "increment",
					id: "uw_existing",
					add: { usage: 1 },
					guard: { window_start_at: today.windowStartAt },
				},
			]);

			const expired = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				usageWindows: [
					counterRow({
						usage: 4,
						windowStartAt: today.windowStartAt - 86_400_000,
						windowEndAt: today.windowStartAt,
					}),
				],
				value: 10,
			});
			expect(expired).toMatchObject({ appliedValue: 5, remaining: 5 });
			expect(windowChangesOf(expired)).toMatchObject([
				{
					op: "update",
					id: "uw_existing",
					after: { usage: 5, window_start_at: today.windowStartAt },
				},
			]);
		},
	);

	test.concurrent(
		"a filtered cap binds only events whose properties match",
		() => {
			const customer = dailyCap({
				limit: 5,
				filter: { properties: { model: "gpt" } },
			});
			const rows = [createCustomerEntitlement({ balance: 10 })];

			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					properties: { model: "gpt" },
				}),
			).toMatchObject({ appliedValue: 5 });
			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					properties: { model: "other" },
				}),
			).toMatchObject({ appliedValue: 10 });
		},
	);

	test.concurrent(
		"a window shortfall follows the overage behaviour: reject refuses, overflow bypasses",
		() => {
			const customer = dailyCap({ limit: 5 });
			const rows = [createCustomerEntitlement({ balance: 10 })];

			expect(
				deductFrom({
					customer,
					customerEntitlements: rows,
					value: 10,
					overageBehavior: "reject",
				}),
			).toMatchObject({ rejected: true, changes: [] });
			// Overflow skips the gate but the counter still records the draw, past its limit.
			const overflowed = deductFrom({
				customer,
				customerEntitlements: rows,
				value: 10,
				overageBehavior: "overflow",
			});
			expect(overflowed).toMatchObject({ appliedValue: 10 });
			expect(windowChangesOf(overflowed)).toEqual([
				expect.objectContaining({
					op: "insert",
					row: expect.objectContaining({ usage: 10 }),
				}),
			]);
		},
	);

	test.concurrent("a cap of zero blocks every draw", () => {
		const customer = dailyCap({ limit: 0 });
		const rows = [createCustomerEntitlement({ balance: 10 })];

		expect(
			deductFrom({ customer, customerEntitlements: rows, value: 3 }),
		).toMatchObject({ appliedValue: 0, changes: [] });
		expect(
			deductFrom({
				customer,
				customerEntitlements: rows,
				value: 3,
				overageBehavior: "reject",
			}),
		).toMatchObject({ rejected: true });
	});

	test.concurrent(
		"a metered cap gates the rollover phase; the counter records what the rollover gave",
		() => {
			const outcome = deductFrom({
				customer: dailyCap({ limit: 5 }),
				customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
				rollovers: [
					{
						id: "ro_1",
						cus_ent_id: "messages_monthly",
						balance: 10,
						usage: 0,
						expires_at: null,
					},
				],
				value: 8,
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 3 });
			expect(
				outcome.deltas.map((delta) => [delta.table, delta.balanceDelta]),
			).toEqual([["rollovers", -5]]);
			expect(windowChangesOf(outcome)).toEqual([
				expect.objectContaining({
					row: expect.objectContaining({ usage: 5 }),
				}),
			]);
		},
	);

	test.concurrent(
		"a cap on a credit pool counts the credits drawn, not the tracked units",
		() => {
			const state = createSubjectState({
				identity,
				customer: dailyCap({ limit: 1, featureId: "credits" }),
				customerProducts: [createCustomerProduct()],
				customerEntitlements: [
					createCustomerEntitlement({
						id: "credits_row",
						featureId: "credits",
						balance: 100,
					}),
				],
			});
			const catalog = createCatalogFor({ state });
			const credits = catalog.features.feat_credits;
			if (!credits) throw new Error("credits feature row missing");
			credits.type = FeatureType.CreditSystem;
			credits.config = {
				schema: [
					{
						metered_feature_id: "messages",
						feature_amount: 1,
						credit_amount: 0.2,
					},
				],
			};
			const outcome = deduct({
				fullSubject: subjectStateToFullSubject({ state, catalog }),
				request: createDeductionRequest({
					internalFeatureId: "feat_messages",
					org,
					value: 4,
				}),
			});

			// 4 units × 0.2 = 0.8 credits under a 1-credit cap
			expect(outcome).toMatchObject({ appliedValue: 4, remaining: 0 });
			expect(windowChangesOf(outcome)).toEqual([
				expect.objectContaining({
					row: expect.objectContaining({ feature_id: "credits", usage: 0.8 }),
				}),
			]);

			// 6 units would be 1.2 credits; the cap leaves 1 credit, so 5 units.
			expect(
				deduct({
					fullSubject: subjectStateToFullSubject({ state, catalog }),
					request: createDeductionRequest({
						internalFeatureId: "feat_messages",
						org,
						value: 6,
					}),
				}),
			).toMatchObject({ appliedValue: 5, remaining: 1 });
		},
	);

	/** A `credits` pool whose schema prices messages; the catalog's feature row is what makes it a credit system. */
});
