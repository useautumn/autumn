import {
	type CheckParams,
	CusProductStatus,
	type FullCusProduct,
	SuccessCode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { getProductCheckPreview } from "./getProductCheckPreview.js";

export const handleProductCheck = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: CheckParams & {
		product_id: string;
	};
}) => {
	const {
		customer_id,
		product_id,
		entity_id,
		customer_data,
		with_preview,
		entity_data,
	} = body;

	const { org, env, logger, db } = ctx;

	// 1. Get customer and org
	const [customer, product] = await Promise.all([
		getOrCreateCustomer({
			req: ctx as ExtendedRequest,
			customerId: customer_id,
			customerData: customer_data,
			inStatuses: [
				CusProductStatus.Active,
				CusProductStatus.PastDue,
				CusProductStatus.Scheduled,
			],

			entityId: entity_id,
			entityData: entity_data,
			withEntities: true,
		}),
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: product_id,
		}),
	]);

	let cusProducts = customer.customer_products;
	if (customer.entity) {
		cusProducts = cusProducts.filter(
			(cusProduct: FullCusProduct) =>
				cusProduct.internal_entity_id === customer.entity!.internal_id,
		);
	}

	const cusProduct: FullCusProduct | undefined = cusProducts.find(
		(cusProduct: FullCusProduct) => cusProduct.product.id === product_id,
	);

	const preview = with_preview
		? await getProductCheckPreview({
				req: ctx as ExtendedRequest,
				customer,
				product,
				logger,
			})
		: undefined;

	if (!cusProduct) {
		return {
			customer_id,
			code: SuccessCode.ProductFound,
			product_id,
			allowed: false,
			preview,
		};
	}

	const onTrial =
		notNullish(cusProduct.trial_ends_at) &&
		cusProduct.trial_ends_at! > Date.now();

	return {
		customer_id,
		code: SuccessCode.ProductFound,
		product_id,
		entity_id,
		allowed:
			cusProduct.status === CusProductStatus.Active ||
			cusProduct.status === CusProductStatus.PastDue,
		status: notNullish(cusProduct.canceled_at)
			? "canceled"
			: onTrial
				? "trialing"
				: cusProduct.status,

		preview,
	};
};
