import { describe, expect, test } from "bun:test";
import { type FullCusProduct, ProcessorType } from "@autumn/shared";
import {
	basePrice,
	catalogPlan,
	customerPlan,
	derive,
	fakeLogger,
	includedItem,
	prepaidItem,
} from "./isCustomFixtures";

/**
 * The flag is biased towards custom: a false positive only skips a customer in
 * version migrations, a false negative lets one overwrite real customizations.
 */
describe("deriveCustomerProductIsCustom outcome", () => {
	test("matches the catalog plan → not custom", () => {
		const plan = { items: [includedItem()], prices: [basePrice()] };

		expect(
			derive({ customer: customerPlan(plan), catalog: catalogPlan(plan) }),
		).toEqual({ isCustom: false, outcome: "matches_catalog" });
	});

	test("an empty plan on both sides → not custom", () => {
		expect(
			derive({ customer: customerPlan(), catalog: catalogPlan() }),
		).toEqual({ isCustom: false, outcome: "matches_catalog" });
	});

	test("a diverging plan → custom, carrying the diff", () => {
		const result = derive({
			customer: customerPlan({ items: [includedItem({ allowance: 500 })] }),
			catalog: catalogPlan({ items: [includedItem({ allowance: 200 })] }),
		});

		expect(result.isCustom).toBe(true);
		expect(result.outcome).toBe("customized");
		expect("diff" in result && result.diff.items).toHaveLength(1);
	});

	describe("never counts", () => {
		test("a longer free trial with identical items", () => {
			const items = [includedItem()];
			const trial = (length: number) => ({
				length,
				duration: "day",
				unique_fingerprint: false,
				card_required: false,
			});

			expect(
				derive({
					customer: customerPlan({ items, freeTrial: trial(60) }),
					catalog: catalogPlan({ items, freeTrial: trial(14) }),
				}).isCustom,
			).toBe(false);
		});

		test("product-level details like the name", () => {
			const items = [includedItem()];

			expect(
				derive({
					customer: customerPlan({ items, name: "Pro (renamed)" }),
					catalog: catalogPlan({ items }),
				}).isCustom,
			).toBe(false);
		});

		test("runtime balance, usage and rollover balances", () => {
			const items = [includedItem()];

			expect(
				derive({
					customer: customerPlan({
						items,
						balance: -40,
						rolloverBalances: [120, 30],
					}),
					catalog: catalogPlan({ items }),
				}).isCustom,
			).toBe(false);
		});

		test("a prepaid quantity the customer chose", () => {
			const items = [prepaidItem()];

			expect(
				derive({
					customer: customerPlan({
						items,
						options: [
							{
								feature_id: "credits",
								internal_feature_id: "internal_credits",
								quantity: 4_000,
							},
						],
					}),
					catalog: catalogPlan({ items }),
				}).isCustom,
			).toBe(false);
		});

		test("item order", () => {
			const credits = includedItem();
			const prepaid = prepaidItem({
				entitlementId: "ent_credits_prepaid",
				priceId: "pr_credits_prepaid",
				allowance: 50,
			});

			expect(
				derive({
					customer: customerPlan({ items: [prepaid, credits] }),
					catalog: catalogPlan({ items: [credits, prepaid] }),
				}).isCustom,
			).toBe(false);
		});
	});

	describe("RevenueCat", () => {
		test("diverging from the catalog → not custom", () => {
			expect(
				derive({
					customer: customerPlan({
						items: [includedItem({ allowance: 900 })],
						prices: [basePrice({ amount: 99 })],
						processorType: ProcessorType.RevenueCat,
					}),
					catalog: catalogPlan({
						items: [includedItem()],
						prices: [basePrice()],
					}),
				}),
			).toEqual({ isCustom: false, outcome: "revenuecat" });
		});

		test("with an unresolvable catalog version → not custom", () => {
			expect(
				derive({
					customer: customerPlan({
						items: [includedItem()],
						processorType: ProcessorType.RevenueCat,
					}),
					catalog: null,
				}),
			).toEqual({ isCustom: false, outcome: "revenuecat" });
		});

		test("a Stripe product diverging the same way → custom", () => {
			expect(
				derive({
					customer: customerPlan({
						prices: [basePrice({ amount: 99 })],
						processorType: ProcessorType.Stripe,
					}),
					catalog: catalogPlan({ prices: [basePrice()] }),
				}).isCustom,
			).toBe(true);
		});
	});

	describe("conservative fallbacks", () => {
		test("an unresolvable catalog version → custom", () => {
			expect(
				derive({
					customer: customerPlan({ items: [includedItem()] }),
					catalog: null,
				}),
			).toEqual({ isCustom: true, outcome: "catalog_missing" });
		});

		const malformedCustomerProduct = () =>
			({
				id: "cus_prod_malformed",
				internal_product_id: "prod_internal_malformed",
				get product() {
					throw new Error("unreadable customer product");
				},
			}) as unknown as FullCusProduct;

		test("a comparison that throws → custom, reported with the product ids", () => {
			const logger = fakeLogger();

			expect(
				derive({
					customer: malformedCustomerProduct(),
					catalog: catalogPlan({ items: [includedItem()] }),
					logger,
				}),
			).toEqual({ isCustom: true, outcome: "comparison_failed" });

			expect(logger.child).toHaveBeenCalledWith({
				context: {
					customer_product_id: "cus_prod_malformed",
					internal_product_id: "prod_internal_malformed",
				},
			});
			expect(logger.error).toHaveBeenCalledTimes(1);
			const [message, fields] = logger.error.mock.calls[0] as unknown as [
				string,
				{ error: Error },
			];
			expect(message).toContain("unreadable customer product");
			expect(fields.error.message).toContain("cus_prod_malformed");
			expect(fields.error.message).toContain("prod_internal_malformed");
		});

		test("a reporter that throws → still custom", () => {
			const logger = fakeLogger({
				onError: () => {
					throw new Error("sentry down");
				},
			});

			expect(
				derive({
					customer: malformedCustomerProduct(),
					catalog: catalogPlan({ items: [includedItem()] }),
					logger,
				}),
			).toEqual({ isCustom: true, outcome: "comparison_failed" });
			expect(logger.error).toHaveBeenCalledTimes(1);
		});
	});
});
