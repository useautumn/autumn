import type { z } from "zod";
import type { AppEnv } from "../../models/genModels/genEnums.js";
import type { ProductV2 } from "../../models/productV2Models/productV2Models.js";
import type { PlanResponseSchema } from "../../models/productV3Models/productV3Response.js";
import { productV2ToBasePrice } from "./productItemUtils/productItemUtils.js";

export function mapToProductV3({
	product,
	env,
}: {
	product: ProductV2;
	env: AppEnv;
}): z.infer<typeof PlanResponseSchema> {
	const productV3 = {
		id: product.id,
		name: product.name,
		group: product.group,
		env: env,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		version: product.version,
		description:
			"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
		created_at: product.created_at,
		price: productV2ToBasePrice({ product }) || null,
	};
	return productV3;
}

export * from "./productItemUtils/productItemUtils.js";
