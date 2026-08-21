/**
 * pairRemovedAndAddedPlanItems: per-remove best unclaimed matching add.
 *
 * Algorithm: walk removes in order. For each filter, among unclaimed adds that
 * match every specified field, pick the highest-precision candidate (ties:
 * first in add-list order). Claim that add index. Unclaimed removes → removed;
 * unclaimed adds → leftoverAdds.
 *
 * Feature-only filters match every cadence of that feature; month filters do
 * not match lifetime. billing_method on the filter does not claim a free add
 * (same as planItemFilterMatchesCustomerPair / composeMatchKey).
 */

import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingMethod,
	EntInterval,
	type EntitlementPrice,
	type PlanItemFilter,
	ResetInterval,
	keepAddEntitlementPricesForLiveRemoves,
	pairRemovedAndAddedPlanItems,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";

const seatsFeature = features.create({
	id: "seats",
	internalId: "feat_internal_seats",
	name: "Seats",
});

const messages = ({
	id,
	interval = EntInterval.Month,
	intervalCount = 1,
	allowance = 100,
	priced = false,
	billWhen,
}: {
	id: string;
	interval?: EntInterval | null;
	intervalCount?: number;
	allowance?: number;
	priced?: boolean;
	billWhen?: BillWhen;
}): EntitlementPrice =>
	entitlements.buildPricePair({
		entitlement: entitlements.buildWithFeature({
			id,
			feature_id: "messages",
			interval,
			interval_count: intervalCount,
			allowance,
		}),
		price: priced
			? prices.buildUsage({
					overrides: { id: `price_${id}`, entitlement_id: id },
					configOverrides: billWhen ? { bill_when: billWhen } : {},
				})
			: undefined,
	});

const seats = ({
	id,
	interval = EntInterval.Month,
	allowance = 5,
}: {
	id: string;
	interval?: EntInterval | null;
	allowance?: number;
}): EntitlementPrice =>
	entitlements.buildPricePair({
		entitlement: entitlements.buildWithFeature({
			id,
			feature_id: "seats",
			internal_feature_id: seatsFeature.internal_id,
			feature: seatsFeature,
			interval,
			allowance,
		}),
	});

const monthMessagesFilter = ({
	intervalCount,
	billingMethod,
}: {
	intervalCount?: number;
	billingMethod?: BillingMethod;
} = {}): PlanItemFilter => ({
	feature_id: "messages",
	interval: ResetInterval.Month,
	...(intervalCount !== undefined ? { interval_count: intervalCount } : {}),
	...(billingMethod !== undefined ? { billing_method: billingMethod } : {}),
});

const ids = (adds: EntitlementPrice[]) =>
	adds.map((add) => add.entitlement.id);

const expectPairing = ({
	removeItems,
	addEntitlementPrices,
	replacedToIds,
	removedFilters,
	leftoverAddIds,
}: {
	removeItems: PlanItemFilter[];
	addEntitlementPrices: EntitlementPrice[];
	replacedToIds?: string[];
	removedFilters?: PlanItemFilter[];
	leftoverAddIds?: string[];
}) => {
	const result = pairRemovedAndAddedPlanItems({
		removeItems,
		addEntitlementPrices,
	});
	expect(result.replaced.map((row) => row.to.entitlement.id)).toEqual(
		replacedToIds ?? [],
	);
	expect(result.replaced.map((row) => row.from)).toEqual(
		(replacedToIds ?? []).map((_, index) => removeItems[index]!),
	);
	expect(result.removed.map((row) => row.filter)).toEqual(removedFilters ?? []);
	expect(ids(result.leftoverAdds)).toEqual(leftoverAddIds ?? []);
};

describe("pairRemovedAndAddedPlanItems", () => {
	describe("cadence / interval", () => {
		test("10 msgs/mo remove vs 30 lifetime + 20 msgs/mo add: replace 20/mo, leftover 30 lifetime", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const lifetime30 = messages({
				id: "ent_lifetime_30",
				interval: EntInterval.Lifetime,
				allowance: 30,
			});
			const month20 = messages({
				id: "ent_month_20",
				interval: EntInterval.Month,
				allowance: 20,
			});

			for (const addEntitlementPrices of [
				[lifetime30, month20],
				[month20, lifetime30],
			]) {
				expectPairing({
					removeItems: [remove],
					addEntitlementPrices,
					replacedToIds: ["ent_month_20"],
					leftoverAddIds: ["ent_lifetime_30"],
				});
			}
		});

		test("month remove vs lifetime add only: no replace (interval specified, lifetime does not match)", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const lifetime30 = messages({
				id: "ent_lifetime_30",
				interval: EntInterval.Lifetime,
				allowance: 30,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [lifetime30],
				removedFilters: [remove],
				leftoverAddIds: ["ent_lifetime_30"],
			});
		});

		test("null-interval add is lifetime and does not match a month filter", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const unsetLifetime = messages({
				id: "ent_unset_lifetime",
				interval: null,
				allowance: 30,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [unsetLifetime],
				removedFilters: [remove],
				leftoverAddIds: ["ent_unset_lifetime"],
			});
		});

		test("one_off remove vs lifetime + month: claims lifetime not month, regardless of add order", () => {
			const remove: PlanItemFilter = {
				feature_id: "messages",
				interval: ResetInterval.OneOff,
			};
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});
			const month = messages({ id: "ent_month", interval: EntInterval.Month });

			for (const addEntitlementPrices of [
				[month, lifetime],
				[lifetime, month],
			]) {
				expectPairing({
					removeItems: [remove],
					addEntitlementPrices,
					replacedToIds: ["ent_lifetime"],
					leftoverAddIds: ["ent_month"],
				});
			}
		});

		test("month remove vs year add: no replace", () => {
			const remove = monthMessagesFilter();
			const year = messages({ id: "ent_year", interval: EntInterval.Year });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [year],
				removedFilters: [remove],
				leftoverAddIds: ["ent_year"],
			});
		});

		test("feature-only remove vs [lifetime, month]: first-in-list (lifetime) because precision ties", () => {
			const remove: PlanItemFilter = { feature_id: "messages" };
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});
			const month = messages({ id: "ent_month", interval: EntInterval.Month });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [lifetime, month],
				replacedToIds: ["ent_lifetime"],
				leftoverAddIds: ["ent_month"],
			});
		});

		test("feature-only remove vs [month, lifetime]: first-in-list (month) because precision ties", () => {
			const remove: PlanItemFilter = { feature_id: "messages" };
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});
			const month = messages({ id: "ent_month", interval: EntInterval.Month });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [month, lifetime],
				replacedToIds: ["ent_month"],
				leftoverAddIds: ["ent_lifetime"],
			});
		});
	});

	describe("interval_count", () => {
		test("interval_count 1 vs 3 (monthly vs quarterly): no cross-claim", () => {
			const monthlyFilter = monthMessagesFilter({ intervalCount: 1 });
			const quarterly = messages({
				id: "ent_quarterly",
				interval: EntInterval.Month,
				intervalCount: 3,
			});

			expectPairing({
				removeItems: [monthlyFilter],
				addEntitlementPrices: [quarterly],
				removedFilters: [monthlyFilter],
				leftoverAddIds: ["ent_quarterly"],
			});
		});

		test("two removes and two adds at count 1 vs 3: each claims its own count", () => {
			const monthlyFilter = monthMessagesFilter({ intervalCount: 1 });
			const quarterlyFilter = monthMessagesFilter({ intervalCount: 3 });
			const monthly = messages({
				id: "ent_monthly",
				intervalCount: 1,
			});
			const quarterly = messages({
				id: "ent_quarterly",
				intervalCount: 3,
			});

			for (const addEntitlementPrices of [
				[quarterly, monthly],
				[monthly, quarterly],
			]) {
				const result = pairRemovedAndAddedPlanItems({
					removeItems: [monthlyFilter, quarterlyFilter],
					addEntitlementPrices,
				});
				expect(result.replaced).toHaveLength(2);
				expect(result.replaced[0]?.from).toEqual(monthlyFilter);
				expect(result.replaced[0]?.to.entitlement.id).toBe("ent_monthly");
				expect(result.replaced[1]?.from).toEqual(quarterlyFilter);
				expect(result.replaced[1]?.to.entitlement.id).toBe("ent_quarterly");
				expect(result.removed).toEqual([]);
				expect(result.leftoverAdds).toEqual([]);
			}
		});

		test("filter omits interval_count: month matches count 1 and 3, first unclaimed add wins", () => {
			const remove = monthMessagesFilter();
			const monthly = messages({ id: "ent_monthly", intervalCount: 1 });
			const quarterly = messages({ id: "ent_quarterly", intervalCount: 3 });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [quarterly, monthly],
				replacedToIds: ["ent_quarterly"],
				leftoverAddIds: ["ent_monthly"],
			});
		});

		test("unset interval_count on the add equals 1", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const unsetCount = messages({ id: "ent_unset_count" });
			unsetCount.entitlement.interval_count = null as unknown as number;

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [unsetCount],
				replacedToIds: ["ent_unset_count"],
			});
		});
	});

	describe("feature", () => {
		test("different feature_id never pairs", () => {
			const remove = monthMessagesFilter();
			const seatsAdd = seats({ id: "ent_seats" });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [seatsAdd],
				removedFilters: [remove],
				leftoverAddIds: ["ent_seats"],
			});
		});

		test("two features, two removes, two adds: independent replaces", () => {
			const messagesFilter = monthMessagesFilter();
			const seatsFilter: PlanItemFilter = {
				feature_id: "seats",
				interval: ResetInterval.Month,
			};
			const messagesAdd = messages({ id: "ent_messages_new" });
			const seatsAdd = seats({ id: "ent_seats_new" });

			const result = pairRemovedAndAddedPlanItems({
				removeItems: [messagesFilter, seatsFilter],
				addEntitlementPrices: [seatsAdd, messagesAdd],
			});
			expect(result.replaced).toHaveLength(2);
			expect(result.replaced[0]?.from).toEqual(messagesFilter);
			expect(result.replaced[0]?.to.entitlement.id).toBe("ent_messages_new");
			expect(result.replaced[1]?.from).toEqual(seatsFilter);
			expect(result.replaced[1]?.to.entitlement.id).toBe("ent_seats_new");
			expect(result.removed).toEqual([]);
			expect(result.leftoverAdds).toEqual([]);
		});

		test("one remove two adds same feature: one replace + leftover add", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const first = messages({ id: "ent_first", allowance: 20 });
			const second = messages({ id: "ent_second", allowance: 40 });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [first, second],
				replacedToIds: ["ent_first"],
				leftoverAddIds: ["ent_second"],
			});
		});
	});

	describe("billing_method", () => {
		test("prepaid filter vs free (no price) add: must not claim", () => {
			const remove = monthMessagesFilter({
				intervalCount: 1,
				billingMethod: BillingMethod.Prepaid,
			});
			const free = messages({ id: "ent_free", allowance: 20 });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [free],
				removedFilters: [remove],
				leftoverAddIds: ["ent_free"],
			});
		});

		test("prepaid filter vs prepaid add: replace", () => {
			const remove = monthMessagesFilter({
				intervalCount: 1,
				billingMethod: BillingMethod.Prepaid,
			});
			const prepaid = messages({
				id: "ent_prepaid",
				priced: true,
				billWhen: BillWhen.InAdvance,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [prepaid],
				replacedToIds: ["ent_prepaid"],
			});
		});

		test("prepaid vs usage_based do not cross-claim", () => {
			const prepaidFilter = monthMessagesFilter({
				intervalCount: 1,
				billingMethod: BillingMethod.Prepaid,
			});
			const usageFilter = monthMessagesFilter({
				intervalCount: 1,
				billingMethod: BillingMethod.UsageBased,
			});
			const prepaid = messages({
				id: "ent_prepaid",
				priced: true,
				billWhen: BillWhen.InAdvance,
			});
			const usage = messages({
				id: "ent_usage",
				priced: true,
				billWhen: BillWhen.EndOfPeriod,
			});

			expectPairing({
				removeItems: [prepaidFilter],
				addEntitlementPrices: [usage],
				removedFilters: [prepaidFilter],
				leftoverAddIds: ["ent_usage"],
			});
			expectPairing({
				removeItems: [usageFilter],
				addEntitlementPrices: [prepaid],
				removedFilters: [usageFilter],
				leftoverAddIds: ["ent_prepaid"],
			});

			const result = pairRemovedAndAddedPlanItems({
				removeItems: [prepaidFilter, usageFilter],
				addEntitlementPrices: [usage, prepaid],
			});
			expect(result.replaced[0]?.to.entitlement.id).toBe("ent_prepaid");
			expect(result.replaced[1]?.to.entitlement.id).toBe("ent_usage");
			expect(result.removed).toEqual([]);
			expect(result.leftoverAdds).toEqual([]);
		});

		test("filter without billing_method still claims a free add", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const free = messages({ id: "ent_free" });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [free],
				replacedToIds: ["ent_free"],
			});
		});

		test("filter without billing_method claims a priced add when it is the only match", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const prepaid = messages({
				id: "ent_prepaid",
				priced: true,
				billWhen: BillWhen.InAdvance,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [prepaid],
				replacedToIds: ["ent_prepaid"],
			});
		});
	});

	describe("claim / order", () => {
		test("claimed add cannot be taken by a later remove", () => {
			const first = monthMessagesFilter({ intervalCount: 1 });
			const second = monthMessagesFilter({ intervalCount: 1 });
			const only = messages({ id: "ent_only" });

			expectPairing({
				removeItems: [first, second],
				addEntitlementPrices: [only],
				replacedToIds: ["ent_only"],
				removedFilters: [second],
			});
		});

		test("feature-only remove vs [month, lifetime] claims month; later lifetime remove gets leftover lifetime", () => {
			const featureOnly: PlanItemFilter = { feature_id: "messages" };
			const lifetimeFilter: PlanItemFilter = {
				feature_id: "messages",
				interval: ResetInterval.OneOff,
			};
			const month = messages({ id: "ent_month", interval: EntInterval.Month });
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});

			const result = pairRemovedAndAddedPlanItems({
				removeItems: [featureOnly, lifetimeFilter],
				addEntitlementPrices: [month, lifetime],
			});
			expect(result.replaced[0]?.from).toEqual(featureOnly);
			expect(result.replaced[0]?.to.entitlement.id).toBe("ent_month");
			expect(result.replaced[1]?.from).toEqual(lifetimeFilter);
			expect(result.replaced[1]?.to.entitlement.id).toBe("ent_lifetime");
		});

		test("month remove picks month add even when lifetime is listed first; later one_off remove gets lifetime", () => {
			const monthFilter = monthMessagesFilter({ intervalCount: 1 });
			const lifetimeFilter: PlanItemFilter = {
				feature_id: "messages",
				interval: ResetInterval.OneOff,
			};
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});
			const month = messages({ id: "ent_month", interval: EntInterval.Month });

			const result = pairRemovedAndAddedPlanItems({
				removeItems: [monthFilter, lifetimeFilter],
				addEntitlementPrices: [lifetime, month],
			});
			expect(result.replaced[0]?.from).toEqual(monthFilter);
			expect(result.replaced[0]?.to.entitlement.id).toBe("ent_month");
			expect(result.replaced[1]?.from).toEqual(lifetimeFilter);
			expect(result.replaced[1]?.to.entitlement.id).toBe("ent_lifetime");
			expect(result.removed).toEqual([]);
			expect(result.leftoverAdds).toEqual([]);
		});

		test("more removes than adds: leftover removes stay removed", () => {
			const first = monthMessagesFilter({ intervalCount: 1 });
			const second: PlanItemFilter = { feature_id: "seats" };
			const third: PlanItemFilter = { feature_id: "dashboard" };
			const only = messages({ id: "ent_only" });

			expectPairing({
				removeItems: [first, second, third],
				addEntitlementPrices: [only],
				replacedToIds: ["ent_only"],
				removedFilters: [second, third],
			});
		});

		test("more adds than removes: leftover adds stay leftover", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const month = messages({ id: "ent_month" });
			const extra = messages({
				id: "ent_year",
				interval: EntInterval.Year,
			});
			const seatsAdd = seats({ id: "ent_seats" });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [extra, month, seatsAdd],
				replacedToIds: ["ent_month"],
				leftoverAddIds: ["ent_year", "ent_seats"],
			});
		});

		test("empty remove list leaves every add leftover", () => {
			const month = messages({ id: "ent_month" });

			expectPairing({
				removeItems: [],
				addEntitlementPrices: [month],
				leftoverAddIds: ["ent_month"],
			});
		});

		test("empty add list leaves every remove removed", () => {
			const remove = monthMessagesFilter();

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [],
				removedFilters: [remove],
			});
		});

		test("empty remove list and empty add list yield empty buckets", () => {
			expectPairing({
				removeItems: [],
				addEntitlementPrices: [],
			});
		});
	});

	describe("included", () => {
		test("M7: remove included 100 still pairs with add 200 at the same cadence", () => {
			const remove = {
				...monthMessagesFilter({ intervalCount: 1 }),
				included: 100,
			};
			const month200 = messages({
				id: "ent_month_200",
				allowance: 200,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [month200],
				replacedToIds: ["ent_month_200"],
			});
		});
	});

	describe("sparse vs full filters", () => {
		test("{ feature_id } still pairs with a month add", () => {
			const remove: PlanItemFilter = { feature_id: "messages" };
			const month = messages({ id: "ent_month" });

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [month],
				replacedToIds: ["ent_month"],
			});
		});

		test("{ feature_id, interval: month, interval_count: 1 } does not pair with quarterly", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const quarterly = messages({
				id: "ent_quarterly",
				intervalCount: 3,
			});

			expectPairing({
				removeItems: [remove],
				addEntitlementPrices: [quarterly],
				removedFilters: [remove],
				leftoverAddIds: ["ent_quarterly"],
			});
		});
	});

	describe("inputs are not mutated", () => {
		test("remove and add arrays keep length, order, and object identity", () => {
			const remove = monthMessagesFilter({ intervalCount: 1 });
			const lifetime = messages({
				id: "ent_lifetime",
				interval: EntInterval.Lifetime,
			});
			const month = messages({ id: "ent_month" });
			const removeItems = [remove];
			const addEntitlementPrices = [lifetime, month];

			const result = pairRemovedAndAddedPlanItems({
				removeItems,
				addEntitlementPrices,
			});

			expect(removeItems).toHaveLength(1);
			expect(removeItems[0]).toBe(remove);
			expect(addEntitlementPrices).toEqual([lifetime, month]);
			expect(addEntitlementPrices[0]).toBe(lifetime);
			expect(addEntitlementPrices[1]).toBe(month);
			expect(result.replaced[0]?.to).toBe(month);
			expect(result.leftoverAdds[0]).toBe(lifetime);
		});
	});
});

describe("keepAddEntitlementPricesForLiveRemoves", () => {
	test("drops the paired replace add when the remove missed; leftover adds stay", () => {
		const month = messages({ id: "ent_month_200", allowance: 200 });
		const lifetime = messages({
			id: "ent_lifetime",
			interval: EntInterval.Lifetime,
			allowance: 50,
		});
		const kept = keepAddEntitlementPricesForLiveRemoves({
			removeItems: [monthMessagesFilter()],
			addEntitlementPrices: [month, lifetime],
			removeFilterMatchedLive: () => false,
		});
		expect(ids(kept)).toEqual(["ent_lifetime"]);
	});

	test("keeps the paired replace add when the remove hit live", () => {
		const month = messages({ id: "ent_month_200", allowance: 200 });
		const lifetime = messages({
			id: "ent_lifetime",
			interval: EntInterval.Lifetime,
			allowance: 50,
		});
		const kept = keepAddEntitlementPricesForLiveRemoves({
			removeItems: [monthMessagesFilter()],
			addEntitlementPrices: [month, lifetime],
			removeFilterMatchedLive: () => true,
		});
		expect(ids(kept)).toEqual(["ent_month_200", "ent_lifetime"]);
	});
});
