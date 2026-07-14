import { describe, expect, test } from "bun:test";
import type { Price } from "@autumn/shared";
import { getStripePriceIdsForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/getStripePriceIdsForAutumnPrice";

const price = (config: Record<string, unknown>): Price =>
	({ config }) as unknown as Price;

describe("getStripePriceIdsForAutumnPrice per-currency", () => {
	test("includes ids from every currency block", () => {
		const ids = getStripePriceIdsForAutumnPrice({
			price: price({
				stripe_price_id: "price_usd",
				stripe_prepaid_price_v2_id: "price_usd_v2",
				base_currency: "usd",
				currencies: {
					eur: {
						stripe_price_id: "price_eur",
						stripe_empty_price_id: "price_eur_empty",
					},
				},
			}),
		});
		expect(ids.sort()).toEqual(
			["price_eur", "price_eur_empty", "price_usd", "price_usd_v2"].sort(),
		);
	});

	test("single-currency price unchanged", () => {
		expect(
			getStripePriceIdsForAutumnPrice({
				price: price({ stripe_price_id: "price_usd" }),
			}),
		).toEqual(["price_usd"]);
	});
});
