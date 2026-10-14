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

		const freeText = await searchPrices({ autumn: autumnV2_3, search: "pro" });
		expect(freeText.stripe_prices, "free text is not a lookup").toEqual([]);

		const unknown = await searchPrices({
			autumn: autumnV2_3,
			search: "price_1NoSuchPriceForSearch",
		});
		expect(unknown.stripe_prices, "unknown id").toEqual([]);
	},
);
