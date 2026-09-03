import { expect, test } from "bun:test";
import type { Price } from "@autumn/shared";
import {
	BillingInterval,
	BillWhen,
	findPrepaidQuantityTargetPrice,
	isLosingPrepaidQuantityPrice,
	PriceType,
} from "@autumn/shared";

/**
 * Tie-break rules for resolving a feature-keyed prepaid quantity to a single
 * price when a product carries several prepaid prices for the same feature:
 * recurring beats one-off, and among recurring the shortest interval wins.
 */

const prepaidPrice = ({
	id,
	interval,
	intervalCount,
	featureId = "messages",
}: {
	id: string;
	interval: BillingInterval;
	intervalCount?: number;
	featureId?: string;
}) =>
	({
		id,
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.InAdvance,
			interval,
			interval_count: intervalCount,
			feature_id: featureId,
			internal_feature_id: `internal_${featureId}`,
		},
	}) as unknown as Price;

const fixedPrice = ({ id }: { id: string }) =>
	({
		id,
		config: { type: PriceType.Fixed, interval: BillingInterval.Month },
	}) as unknown as Price;

test("recurring prepaid beats one-off prepaid of the same feature", () => {
	const oneOff = prepaidPrice({ id: "pr_one_off", interval: BillingInterval.OneOff });
	const monthly = prepaidPrice({ id: "pr_monthly", interval: BillingInterval.Month });

	const target = findPrepaidQuantityTargetPrice({
		prices: [fixedPrice({ id: "pr_base" }), oneOff, monthly],
		featureId: "messages",
	});

	expect(target?.id).toBe("pr_monthly");
	expect(isLosingPrepaidQuantityPrice({ price: oneOff, prices: [oneOff, monthly] })).toBe(true);
	expect(isLosingPrepaidQuantityPrice({ price: monthly, prices: [oneOff, monthly] })).toBe(false);
});

test("shortest interval wins among recurring prepaid prices", () => {
	const yearly = prepaidPrice({ id: "pr_yearly", interval: BillingInterval.Year });
	const monthly = prepaidPrice({ id: "pr_monthly", interval: BillingInterval.Month });
	const quarterly = prepaidPrice({ id: "pr_quarterly", interval: BillingInterval.Quarter });

	const target = findPrepaidQuantityTargetPrice({
		prices: [yearly, quarterly, monthly],
		featureId: "messages",
	});

	expect(target?.id).toBe("pr_monthly");
});

test("interval count breaks ties within the same interval", () => {
	const threeMonthly = prepaidPrice({
		id: "pr_three_monthly",
		interval: BillingInterval.Month,
		intervalCount: 3,
	});
	const monthly = prepaidPrice({ id: "pr_monthly", interval: BillingInterval.Month });

	const target = findPrepaidQuantityTargetPrice({
		prices: [threeMonthly, monthly],
		featureId: "messages",
	});

	expect(target?.id).toBe("pr_monthly");
});

test("a lone one-off prepaid price still wins its own feature", () => {
	const oneOff = prepaidPrice({ id: "pr_one_off", interval: BillingInterval.OneOff });

	const target = findPrepaidQuantityTargetPrice({
		prices: [fixedPrice({ id: "pr_base" }), oneOff],
		featureId: "messages",
	});

	expect(target?.id).toBe("pr_one_off");
	expect(isLosingPrepaidQuantityPrice({ price: oneOff, prices: [oneOff] })).toBe(false);
});

test("prices of other features never participate", () => {
	const wordsOneOff = prepaidPrice({
		id: "pr_words",
		interval: BillingInterval.OneOff,
		featureId: "words",
	});
	const messagesMonthly = prepaidPrice({
		id: "pr_messages",
		interval: BillingInterval.Month,
	});

	const target = findPrepaidQuantityTargetPrice({
		prices: [wordsOneOff, messagesMonthly],
		featureId: "words",
	});

	expect(target?.id).toBe("pr_words");
	expect(
		isLosingPrepaidQuantityPrice({
			price: wordsOneOff,
			prices: [wordsOneOff, messagesMonthly],
		}),
	).toBe(false);
});

test("no prepaid price for the feature resolves to undefined", () => {
	const target = findPrepaidQuantityTargetPrice({
		prices: [fixedPrice({ id: "pr_base" })],
		featureId: "messages",
	});

	expect(target).toBeUndefined();
});
