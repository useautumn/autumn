import {
	type AttachBody,
	CusProductStatus,
	cusProductToProduct,
	ErrCode,
	nullish,
} from "@autumn/shared";

import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isOneOff } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";

import type { AutumnContext } from "../../../../../../honoUtils/HonoEnv";
import { getExistingCusProducts } from "../../../../cusProducts/cusProductUtils/getExistingCusProducts";

const getProductsForAttach = async ({
	ctx,
	attachBody,
}: {
	ctx: AutumnContext;
	attachBody: AttachBody;
}) => {
	const {
		product_id,
		product_ids,
		version,
		products: inputProducts,
	} = attachBody;

	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: inputProducts
			? inputProducts.map((p) => p.product_id)
			: product_ids || [product_id!],
		version,
	});

	if (notNullish(product_ids) && nullish(inputProducts)) {
		const freeTrialProds = products.filter((prod) =>
			notNullish(prod.free_trial),
		);

		if (freeTrialProds.length > 1) {
			throw new RecaseError({
				message:
					"When providing product_ids, can't have multiple free trial products",
				code: ErrCode.InvalidRequest,
			});
		}

		for (const prod of products) {
			if (prod.is_add_on) continue;

			const otherProd = products.find(
				(p) => p.group === prod.group && !p.is_add_on && p.id !== prod.id,
			);

			if (otherProd && !otherProd.is_add_on && !isOneOff(prod.prices)) {
				throw new RecaseError({
					message:
						"Can't attach multiple products from the same group that are not add-ons",
					code: ErrCode.InvalidRequest,
				});
			}
		}
	}

	return products;
};

export const getCustomerAndProducts = async ({
	ctx,
	attachBody,
}: {
	ctx: AutumnContext;
	attachBody: AttachBody;
}) => {
	const [customer, products] = await Promise.all([
		getOrCreateCustomer({
			ctx,
			customerId: attachBody.customer_id,
			customerData: {
				...attachBody.customer_data,
			},
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.Scheduled,
				CusProductStatus.PastDue,
			],
			withEntities: true,
			entityId: attachBody.entity_id || undefined,
			entityData: attachBody.entity_data || undefined,
		}),
		getProductsForAttach({ ctx, attachBody }),
	]);

	// if customer is on product v3, products[0] should just be the customer's product if version isn't explicitly passed in.
	if (nullish(attachBody.version)) {
		for (let i = 0; i < products.length; i++) {
			// Check if customer has active product
			const { curSameProduct } = getExistingCusProducts({
				product: products[i],
				cusProducts: customer.customer_products,
				internalEntityId: customer.entity?.internal_id,
			});

			if (curSameProduct) {
				products[i] = cusProductToProduct({ cusProduct: curSameProduct });
			}
		}
	}

	return { customer, products };
};
