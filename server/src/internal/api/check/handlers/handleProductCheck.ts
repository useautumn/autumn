import {
	type CheckParams,
	CusProductStatus,
	type FullCusProduct,
	SuccessCode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setCheckSpanAttributes } from "@/internal/balances/check/setCheckSpanAttributes.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { notNullish } from "@/utils/genUtils.js";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";
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

	const { org, env, db } = ctx;

	// 1. Get customer and org
	const [customer, product] = await Promise.all([
		getOrCreateCustomer({
			ctx,
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
				ctx,
				customer,
				product,
			})
		: undefined;

	setRootSpanAttributes({ "check.product_id": product_id });

	if (!cusProduct) {
		setCheckSpanAttributes({
			featureId: undefined,
			allowed: false,
			requiredBalance: 0,
			denyReason: "product_not_attached",
		});
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

	const allowed =
		cusProduct.status === CusProductStatus.Active ||
		cusProduct.status === CusProductStatus.PastDue;

	setCheckSpanAttributes({
		featureId: undefined,
		allowed,
		requiredBalance: 0,
		denyReason: "product_not_active",
	});

	return {
		customer_id,
		code: SuccessCode.ProductFound,
		product_id,
		entity_id,
		allowed,
		status: notNullish(cusProduct.canceled_at)
			? "canceled"
			: onTrial
				? "trialing"
				: cusProduct.status,

		preview,
	};
};
