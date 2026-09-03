/**
 * GET /organization/stripe/prices/search — the picker's only two lookups.
 *
 * Stripe cannot match price ids by substring, so free text is not a query.
 *
 * Contract:
 *   E1  a `price_` id returns exactly that price, with its product resolved
 *   E2  a `prod_` id returns every active price under that product
 *   E3  anything else returns nothing and never reaches Stripe
 *   E4  an unknown id is empty, not an error — the picker says "not found"
 */

import { expect, test } from "bun:test";
import type { StripePriceSearchResponse } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const searchPrices = ({
	autumn,
	search,
}: {
	autumn: AutumnInt;
	search: string;
}): Promise<StripePriceSearchResponse> =>
	autumn.get(
		`/organization/stripe/prices/search?search=${encodeURIComponent(search)}`,
	) as Promise<StripePriceSearchResponse>;

test.concurrent(
	`${chalk.yellowBright("stripe price search: price id resolves one price, product id lists all of them")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const label = uniqueTestId("price_search");
		const product = await ctx.stripeCli.products.create({ name: label });
		const monthly = await ctx.stripeCli.prices.create({
			product: product.id,
			currency: "usd",
			unit_amount: 2000,
			recurring: { interval: "month" },
		});
		const yearly = await ctx.stripeCli.prices.create({
			product: product.id,
			currency: "usd",
			unit_amount: 20000,
			recurring: { interval: "year" },
		});

		// E1: an exact price id, with the product expanded for the subtext.
		const byPrice = await searchPrices({
			autumn: autumnV2_3,
			search: monthly.id,
		});
		expect(byPrice.stripe_prices.map((price) => price.id)).toEqual([
			monthly.id,
		]);
		expect(byPrice.stripe_prices[0]?.product_id, "product id").toBe(product.id);
		expect(byPrice.stripe_prices[0]?.product_name, "product name").toBe(label);
		expect(byPrice.stripe_prices[0]?.unit_amount, "amount").toBe(2000);
		expect(byPrice.stripe_prices[0]?.interval, "interval").toBe("month");

		// E2: every active price under the product, so a product id is pickable.
		const byProduct = await searchPrices({
			autumn: autumnV2_3,
			search: product.id,
		});
		expect(byProduct.stripe_prices.map((price) => price.id).sort()).toEqual(
			[monthly.id, yearly.id].sort(),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("stripe price search: free text and unknown ids return nothing")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });

		// E3: not a lookup — substring search over price ids does not exist.
		const freeText = await searchPrices({ autumn: autumnV2_3, search: "pro" });
		expect(freeText.stripe_prices, "free text is not a lookup").toEqual([]);

		// E4: a well-formed id Stripe does not know is empty, not a 500.
		const unknown = await searchPrices({
			autumn: autumnV2_3,
			search: "price_1NoSuchPriceForSearch",
		});
		expect(unknown.stripe_prices, "unknown id").toEqual([]);
	},
);
