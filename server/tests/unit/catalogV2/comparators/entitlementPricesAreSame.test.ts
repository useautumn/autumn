import { describe, expect, test } from "bun:test";
import {
	type EntitlementPrice,
	entitlementPricesAreSame,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";

const expectSame = (
	entitlementPrice1: EntitlementPrice,
	entitlementPrice2: EntitlementPrice,
	expected: boolean,
) => {
	expect(
		entitlementPricesAreSame({ entitlementPrice1, entitlementPrice2 }),
	).toBe(expected);
	expect(
		entitlementPricesAreSame({
			entitlementPrice1: entitlementPrice2,
			entitlementPrice2: entitlementPrice1,
		}),
	).toBe(expected);
};

describe("entitlementPricesAreSame", () => {
	test("free vs free with identical entitlements are same", () => {
		expectSame(entitlements.buildPricePair(), entitlements.buildPricePair(), true);
	});

	test("different physical entitlement ids are still same (ids ignored)", () => {
		expectSame(
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ id: "ent_a" }),
			}),
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ id: "ent_b" }),
			}),
			true,
		);
	});

	test("entitlement definitions gate first — price never consulted when ents differ", () => {
		const price = prices.buildUsage();
		expectSame(
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ allowance: 100 }),
				price,
			}),
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ allowance: 200 }),
				price,
			}),
			false,
		);
	});

	test("one-sided price differs (XOR)", () => {
		expectSame(
			entitlements.buildPricePair({ price: prices.buildUsage() }),
			entitlements.buildPricePair(),
			false,
		);
	});

	test("price null vs undefined both count as absent", () => {
		expectSame(
			entitlements.buildPricePair({ price: undefined }),
			{ entitlement: entitlements.buildWithFeature(), price: undefined },
			true,
		);
	});

	test("both priced with same config are same, even with different price ids", () => {
		expectSame(
			entitlements.buildPricePair({
				price: prices.buildUsage({ overrides: { id: "pr_a" } }),
			}),
			entitlements.buildPricePair({
				price: prices.buildUsage({ overrides: { id: "pr_b" } }),
			}),
			true,
		);
	});

	test("both priced with different amounts differ", () => {
		expectSame(
			entitlements.buildPricePair({
				price: prices.buildUsage({
					configOverrides: { usage_tiers: [{ to: "inf", amount: 1 }] },
				}),
			}),
			entitlements.buildPricePair({
				price: prices.buildUsage({
					configOverrides: { usage_tiers: [{ to: "inf", amount: 2 }] },
				}),
			}),
			false,
		);
	});

	test("ents differ and prices differ", () => {
		expectSame(
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ allowance: 1 }),
				price: prices.buildUsage({
					configOverrides: { usage_tiers: [{ to: "inf", amount: 1 }] },
				}),
			}),
			entitlements.buildPricePair({
				entitlement: entitlements.buildWithFeature({ allowance: 2 }),
				price: prices.buildUsage({
					configOverrides: { usage_tiers: [{ to: "inf", amount: 2 }] },
				}),
			}),
			false,
		);
	});

	test("default-equivalence flows through: unset billing_units vs explicit 1", () => {
		expectSame(
			entitlements.buildPricePair({
				price: prices.buildUsage({ configOverrides: { billing_units: undefined } }),
			}),
			entitlements.buildPricePair({
				price: prices.buildUsage({ configOverrides: { billing_units: 1 } }),
			}),
			true,
		);
	});
});
