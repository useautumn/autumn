import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	deduplicateArray,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import { subjectToAutoTopupTriggers } from "../../../src/trigger/subjectToAutoTopupTriggers.js";
import type { AutoTopupSubject } from "../../../src/trigger/types/autoTopupSubject.js";
import {
	autoTopupFor,
	CREDITS,
	creditSystemFeature,
	FEATURE,
	legacyCustomerOf,
	NOW,
	oneOffPrepaidPlan,
	PAST,
	plan,
	row,
	subject,
	usagePrice,
} from "./fixtures/subjectFixtures.js";
import { fullCustomerToAutoTopupObjects } from "./legacy/fullCustomerToAutoTopupObjects.js";
import { resolveThresholdSettlement } from "./legacy/resolveThresholdSettlement.js";

/** The loop `triggerAutoTopUp` ran on the server, over the verbatim legacy functions. */
const legacyTriggers = (fullSubject: AutoTopupSubject, featureId: string) => {
	const fullCustomer = legacyCustomerOf(fullSubject);
	const featureIds = deduplicateArray([
		featureId,
		...fullCustomerToCustomerEntitlements({
			fullCustomer,
			fundsFeatureId: featureId,
		}).map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	]);
	const fired: { featureId: string; hasConfig: boolean }[] = [];
	for (const id of featureIds) {
		const resolved = fullCustomerToAutoTopupObjects({
			fullCustomer,
			featureId: id,
		});
		const settlement = resolveThresholdSettlement({
			fullCustomer,
			featureId: id,
		});
		if (!resolved?.balanceBelowThreshold && settlement.kind !== "settle")
			continue;
		fired.push({ featureId: id, hasConfig: resolved !== null });
	}
	return fired;
};

const triggersOf = (fullSubject: AutoTopupSubject, featureId = FEATURE) => {
	const next = subjectToAutoTopupTriggers({ fullSubject, featureId, now: NOW });
	expect(
		next.map((trigger) => ({
			featureId: trigger.featureId,
			hasConfig: trigger.autoTopupConfig !== undefined,
		})),
	).toEqual(legacyTriggers(fullSubject, featureId));
	return next;
};

/** A credits plan whose balance funds the tracked feature. */
const creditsPlan = ({
	balance,
	expiresAt = null,
}: {
	balance: number;
	expiresAt?: number | null;
}) =>
	plan({
		id: "cp_credits",
		prices: [
			usagePrice({
				id: "price_credits",
				entitlementId: "ent_row_credits",
				customerProductId: "cp_credits",
			}),
		],
		rows: [
			row({
				id: "row_credits",
				featureId: CREDITS,
				feature: creditSystemFeature(),
				balance,
				customerProductId: "cp_credits",
				expiresAt,
			}),
		],
	});

const thresholdPlan = ({ usage }: { usage: number }) =>
	plan({
		id: "cp_ppu",
		prices: [
			usagePrice({
				id: "price_ppu",
				entitlementId: "ent_row_ppu",
				customerProductId: "cp_ppu",
				billWhen: BillWhen.EndOfPeriod,
				threshold: 100,
			}),
		],
		rows: [
			row({ id: "row_ppu", balance: -usage, customerProductId: "cp_ppu" }),
		],
	});

describe("subjectToAutoTopupTriggers", () => {
	test("G1 the tracked feature below its threshold fires once with its config", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 5 })],
		});
		expect(triggersOf(s)).toEqual([
			{
				featureId: FEATURE,
				reason: "balance_below_threshold",
				autoTopupConfig: autoTopupFor({ threshold: 20 }),
			},
		]);
	});

	test("G2 above threshold with no threshold billing fires nothing", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [oneOffPrepaidPlan({ id: "cp", balance: 50 })],
		});
		expect(triggersOf(s)).toEqual([]);
	});

	test("G3 a credit system funding the tracked feature fires for the credit feature", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ featureId: CREDITS, threshold: 30 })],
			plans: [creditsPlan({ balance: 29 })],
		});
		expect(triggersOf(s).map((trigger) => trigger.featureId)).toEqual([
			CREDITS,
		]);
	});

	test("G4 the tracked feature and its credit system both fire, tracked first", () => {
		const s = subject({
			autoTopups: [
				autoTopupFor({ threshold: 20 }),
				autoTopupFor({ featureId: CREDITS, threshold: 30 }),
			],
			plans: [
				oneOffPrepaidPlan({ id: "cp", balance: 5 }),
				creditsPlan({ balance: 29 }),
			],
		});
		expect(triggersOf(s).map((trigger) => trigger.featureId)).toEqual([
			FEATURE,
			CREDITS,
		]);
	});

	test("G5 an expired credit row is not a candidate", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ featureId: CREDITS, threshold: 30 })],
			plans: [creditsPlan({ balance: 29, expiresAt: PAST })],
		});
		expect(triggersOf(s)).toEqual([]);
	});

	test("G6 threshold settlement without a config fires with no config", () => {
		expect(
			triggersOf(subject({ plans: [thresholdPlan({ usage: 140 })] })),
		).toEqual([
			{
				featureId: FEATURE,
				reason: "threshold_settlement",
				autoTopupConfig: undefined,
			},
		]);
	});

	test("G7 threshold settlement with a config above threshold carries the config", () => {
		// The overage row is a row of the same feature, so the summed balance is 50 - 140; the threshold sits under it.
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: -200 })],
			plans: [
				oneOffPrepaidPlan({ id: "cp", balance: 50 }),
				thresholdPlan({ usage: 140 }),
			],
		});
		expect(triggersOf(s)).toEqual([
			{
				featureId: FEATURE,
				reason: "threshold_settlement",
				autoTopupConfig: autoTopupFor({ threshold: -200 }),
			},
		]);
	});

	test("G8 below threshold and settlement together fire once, as below threshold", () => {
		const s = subject({
			autoTopups: [autoTopupFor({ threshold: 20 })],
			plans: [
				oneOffPrepaidPlan({ id: "cp", balance: 0 }),
				thresholdPlan({ usage: 140 }),
			],
		});
		expect(triggersOf(s).map((trigger) => trigger.reason)).toEqual([
			"balance_below_threshold",
		]);
	});
});
