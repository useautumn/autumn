import type { z } from "zod/v4";
import type { ProductV2 } from "../../models/productV2Models/productV2Models.js";
import type { PlanResponseSchema } from "../../models/productV3Models/productV3Response.js";
import { productV2ToBasePrice } from "./productItemUtils/productV3ItemUtils.js";

export function mapToProductV3({
	product,
}: {
	product: ProductV2;
}): z.infer<typeof PlanResponseSchema> {
	const productV3 = {
		id: product.id,
		name: product.name,
		group: product.group,
		env: product.env,
		is_add_on: product.is_add_on,
		is_default: product.is_default,
		version: product.version,
		description: "",
		created_at: product.created_at,
		price: productV2ToBasePrice({ product }) || null,
	};
	return productV3;
}

export * from "./productItemUtils/productV3ItemUtils.js";
