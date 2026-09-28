import { describe, expect, test } from "bun:test";
import { BillWhen } from "@autumn/shared";
import { computeThresholdCharge } from "../../../src/trigger/thresholdBilling/computeThresholdCharge.js";
import { resolveThresholdSettlement } from "../../../src/trigger/thresholdBilling/resolveThresholdSettlement.js";
import type { AutoTopupSubject } from "../../../src/trigger/types/autoTopupSubject.js";
import {
	FEATURE,
	legacyCustomerOf,
	NOW,
	plan,
	row,
	subject,
	usagePrice,
} from "./fixtures/subjectFixtures.js";
import { resolveThresholdSettlement as legacyResolve } from "./legacy/resolveThresholdSettlement.js";

const settlementOf = (fullSubject: AutoTopupSubject, featureId = FEATURE) => {
	const next = resolveThresholdSettlement({ fullSubject, featureId, now: NOW });
	const legacy = legacyResolve({
		fullCustomer: legacyCustomerOf(fullSubject),
		featureId,
	});
	expect(next.kind).toBe(legacy.kind);
	if (next.kind === "settle" && legacy.kind === "settle") {
		expect(next.charge).toEqual(legacy.charge);
		expect(next.customerEntitlement.id).toBe(legacy.customerEntitlement.id);
	}
	return next;
};

/** A pay-per-use plan billed every `threshold` units, `usage` units into overage. */
const thresholdPlan = ({
	id = "cp",
	usage = 140,
	threshold = 100,
	billWhen = BillWhen.EndOfPeriod,
	entities,
}: {
	id?: string;
	usage?: number;
	/** null: a pay-per-use price with no threshold block at all. */
	threshold?: number | null;
	billWhen?: BillWhen;
	entities?: Record<
		string,
		{ id: string; balance: number; adjustment: number }
	>;
} = {}) =>
	plan({
		id,
		prices: [
			usagePrice({
				id: `price_${id}`,
				entitlementId: `ent_row_${id}`,
				customerProductId: id,
				billWhen,
				threshold: threshold ?? undefined,
			}),
		],
		rows: [
			row({
				id: `row_${id}`,
				balance: -usage,
				customerProductId: id,
				entities,
				entityFeatureId: entities ? "seats" : null,
			}),
		],
	});

describe("resolveThresholdSettlement", () => {
	test("R1 no threshold price anywhere", () => {
		const s = subject({ plans: [thresholdPlan({ threshold: null })] });
		expect(settlementOf(s)).toEqual({ kind: "not_threshold_billed" });
	});

	test("R2 overage below the threshold", () => {
		expect(
			settlementOf(subject({ plans: [thresholdPlan({ usage: 99 })] })).kind,
		).toBe("nothing_to_settle");
	});

	for (const usage of [100, 140, 240]) {
		test(`R3 settles one chunk at ${usage} units`, () => {
			expect(
				settlementOf(subject({ plans: [thresholdPlan({ usage })] })),
			).toMatchObject({
				kind: "settle",
				customerEntitlement: { customer_product_id: "cp" },
				threshold: 100,
				charge: { chargeUnits: 100, remainingUnits: usage - 100 },
			});
		});
	}

	test("R4 a prepaid price with a threshold block is not threshold billed", () => {
		const s = subject({
			plans: [thresholdPlan({ billWhen: BillWhen.InAdvance })],
		});
		expect(settlementOf(s)).toEqual({ kind: "not_threshold_billed" });
	});

	test("R5 a non-positive threshold is ignored", () => {
		expect(
			settlementOf(subject({ plans: [thresholdPlan({ threshold: 0 })] })),
		).toEqual({ kind: "not_threshold_billed" });
	});

	test("R6 a loose row is skipped", () => {
		expect(
			settlementOf(subject({ extras: [row({ id: "loose", balance: -500 })] })),
		).toEqual({ kind: "not_threshold_billed" });
	});

	test("R7 the first row past its threshold settles", () => {
		const s = subject({
			plans: [
				thresholdPlan({ id: "cp_low", usage: 10 }),
				thresholdPlan({ id: "cp_high", usage: 150 }),
			],
		});
		expect(settlementOf(s)).toMatchObject({
			kind: "settle",
			customerEntitlement: { id: "row_cp_high" },
		});
	});

	test("R8 an entity-scoped row sums overage across its entities", () => {
		const s = subject({
			plans: [
				thresholdPlan({
					usage: 0,
					entities: {
						e1: { id: "e1", balance: -60, adjustment: 0 },
						e2: { id: "e2", balance: -50, adjustment: 0 },
					},
				}),
			],
		});
		expect(settlementOf(s)).toMatchObject({
			kind: "settle",
			charge: { chargeUnits: 100, remainingUnits: 10 },
		});
	});
});

describe("R9 computeThresholdCharge", () => {
	test("charges exactly the threshold and leaves residual overage", () => {
		expect(
			computeThresholdCharge({ outstandingUnits: 140, threshold: 100 }),
		).toEqual({ chargeUnits: 100, remainingUnits: 40 });
	});
	test("does not charge below the threshold", () => {
		expect(
			computeThresholdCharge({ outstandingUnits: 99, threshold: 100 }),
		).toBeNull();
	});
	test("does not duplicate an in-flight threshold claim", () => {
		expect(
			computeThresholdCharge({
				outstandingUnits: 140,
				threshold: 100,
				claimedUnits: 100,
			}),
		).toBeNull();
	});
	test("allows a second threshold chunk after more usage arrives", () => {
		expect(
			computeThresholdCharge({
				outstandingUnits: 240,
				threshold: 100,
				claimedUnits: 100,
			}),
		).toEqual({ chargeUnits: 100, remainingUnits: 40 });
	});
});
