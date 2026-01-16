import type { AppEnv, Organization } from "@autumn/shared";
import { expect } from "chai";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const checkSubscriptionContainsProducts = async ({
	db,
	org,
	env,
	subscriptionId,
	productIds,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	subscriptionId: string;
	productIds: string[];
}) => {
	const stripeCli = createStripeCli({ org: org, env: env });
	const sub = await stripeCli.subscriptions.retrieve(subscriptionId);

	let totalPriceCount = 0;
	for (const productId of productIds) {
		const product = await ProductService.getFull({
			db,
			idOrInternalId: productId,
			orgId: org.id,
			env: env,
		});

		for (const price of product.prices) {
			totalPriceCount++;
			try {
				expect(
					sub.items.data.some(
						(item) => item.price.id === price.config.stripe_price_id,
					),
				).to.be.true;
			} catch (error) {
				console.log("Stripe sub prices not matching product prices");
				console.log(
					"Prices:",
					product.prices.map((p: any) => p.config.stripe_price_id),
				);
				console.log(
					"Sub items:",
					sub.items.data.map((i: any) => i.price.id),
				);
				throw error;
			}
		}
	}
	try {
		expect(sub.items.data.length).to.equal(totalPriceCount);
	} catch (error) {
		console.log("Num of sub prices not matching num of product prices");
		console.log("Sub prices:", sub.items.data.length);
		console.log("Product prices:", totalPriceCount);
		throw error;
	}
};
