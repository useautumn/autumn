import { anthropic } from "@ai-sdk/anthropic";
import { BillingInterval, type FullProduct } from "@autumn/shared";
import { generateObject } from "ai";
import type { Logger } from "pino";
import { z } from "zod";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { nullish } from "@/utils/genUtils.js";
import { ProductService } from "../ProductService.js";

const prompt = `Detect whether a given product (called "product_to_detect") is an interval variant of a base product from the list of existing products (called "existing_products").

An interval variant simply means a product is a quarterly, semi-annual, or annual version of a base monthly product. 

If the given product is a variant of another product (which we'll call the base variant), please return the id of the base variant in the base_variant_id field.

To determine if a product is an interval variant, please follow these guidelines:

1. Look at the name of the product. If it contains a word like "annual", "yearly", etc. and the name resembles another product, it's a variant.
- Example of this: "Pro (Annual)" is a variant of "Pro".

2. If the product has a similar name to another product, but interval is different, it's probably a variant.

4. If the current product is not a variant of any existing product, return null.
`;

export const detectBaseVariant = async ({
	db,
	curProduct,
	logger,
}: {
	db: DrizzleCli;
	curProduct: FullProduct;
	logger: Logger;
}) => {
	logger.info(`Detecting base variant for ${curProduct.id}`);
	if (!process.env.ANTHROPIC_API_KEY) return;

	const existingProducts = (await ProductService.listFull({
		db,
		orgId: curProduct.org_id,
		env: curProduct.env,
		excludeEnts: true,
	})) as FullProduct[];

	// if (product.base_variant_id == baseVariantId) {
	const curPrices = curProduct.prices;
	const intervals = curPrices.map((price) => price.config.interval);

	// 1. Return null if add on
	if (curProduct.is_add_on) return null;

	// 2. Return null if only one off or monthly price
	const oneOffOrMonthly = [BillingInterval.OneOff, BillingInterval.Month];
	if (intervals.every((i: BillingInterval) => oneOffOrMonthly.includes(i))) {
		logger.info(`Is one off or monthly, skipping`);
		return null;
	}

	const filteredExistingProducts = existingProducts.filter(
		(p) =>
			p.id !== curProduct.id &&
			nullish(p.base_variant_id) &&
			!p.is_add_on &&
			p.prices.length > 0 &&
			p.prices.every(
				(price) => price.config.interval === BillingInterval.Month,
			) &&
			p.group === curProduct.group,
	);

	if (filteredExistingProducts.length === 0) {
		logger.info(`No base product to search for`);
		return null;
	}

	const variables = `
<product_to_detect>
  ${JSON.stringify({
		id: curProduct.id,
		name: curProduct.name,
		prices: curPrices,
	})}
</product_to_detect>

<existing_products>
  ${filteredExistingProducts
		.map((p) =>
			JSON.stringify({
				id: p.id,
				name: p.name,
				prices: p.prices,
			}),
		)
		.join("\n")}
</existing_products>
`;

	const { object } = await generateObject({
		model: anthropic("claude-3-5-haiku-latest"),
		schema: z.object({ base_variant_id: z.string().nullable() }),
		prompt: `${prompt}\n\n${variables}`,
	});

	const baseVariantId = object.base_variant_id;

	logger.info(
		`llm response for base variant of ${curProduct.id}: ${baseVariantId}`,
	);

	if (baseVariantId) {
		await ProductService.updateByInternalId({
			db,
			internalId: curProduct.internal_id,
			update: {
				base_variant_id: baseVariantId,
			},
		});
	}

	return baseVariantId;
};
