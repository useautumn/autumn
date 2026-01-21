import {
	ACTIVE_STATUSES,
	AttachScenario,
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";
import { isFreeProduct } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { handleAddProduct } from "../attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { newCusToAttachParams } from "../attach/attachUtils/attachParams/convertToParams.js";
import { initStripeCusAndProducts } from "../handlers/handleCreateCustomer.js";
import { CusProductService, RELEVANT_STATUSES } from "./CusProductService.js";
import { getExistingCusProducts } from "./cusProductUtils/getExistingCusProducts.js";

export const getDefaultProduct = async ({
	ctx,
	productGroup,
}: {
	ctx: AutumnContext;
	productGroup: string;
}) => {
	const { db, org, env } = ctx;
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const defaultProd = defaultProducts.find(
		(p) =>
			p.group === productGroup && !isDefaultTrialFullProduct({ product: p }),
	);

	return defaultProd;
};

// This function is only used in cancellation flows
export const activateDefaultProduct = async ({
	ctx,
	productGroup,
	fullCus,
	curCusProduct,
}: {
	ctx: AutumnContext;
	productGroup: string;
	fullCus: FullCustomer;
	curCusProduct?: FullCusProduct;
}) => {
	const { db, org, env, logger } = ctx;
	// 1. Expire current product
	const defaultProducts = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	// Look for a paid default trial first, then fall back to free default
	const defaultProd: FullProduct | undefined = defaultProducts.find(
		(p) =>
			p.group === productGroup && !isDefaultTrialFullProduct({ product: p }),
	);

	if (!defaultProd) return false;

	if (curCusProduct?.internal_product_id === defaultProd.internal_id) {
		return false;
	}

	const stripeCli = createStripeCli({ org, env });
	const defaultIsFree = isFreeProduct(defaultProd.prices);

	// Initialize Stripe customer and products if needed (for paid non-trial products)
	if (!defaultIsFree) {
		await initStripeCusAndProducts({
			ctx,
			customer: fullCus,
			products: [defaultProd],
		});
	}

	// If default is already active, skip
	const existingDefaultProduct = fullCus.customer_products.find(
		(cp) =>
			cp.product.id === defaultProd?.id && ACTIVE_STATUSES.includes(cp.status),
	);

	if (existingDefaultProduct) {
		logger.info(
			`Default product ${defaultProd?.name} already exists for customer`,
		);
		return false;
	}

	await handleAddProduct({
		ctx,
		attachParams: newCusToAttachParams({
			ctx,
			newCus: fullCus,
			products: [defaultProd],
			stripeCli,
		}),
	});

	return true;
};

export const activateFutureProduct = async ({
	ctx,
	cusProduct,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
}) => {
	const { db, org, env, logger } = ctx;

	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId: cusProduct.internal_customer_id,
		inStatuses: [CusProductStatus.Scheduled],
	});

	const { curScheduledProduct: futureProduct } = getExistingCusProducts({
		product: cusProduct.product,
		cusProducts,
		internalEntityId: cusProduct.internal_entity_id,
	});

	if (!futureProduct) {
		return false;
	}

	await CusProductService.update({
		db,
		cusProductId: futureProduct.id,
		updates: { status: CusProductStatus.Active },
	});

	await addProductsUpdatedWebhookTask({
		ctx,
		internalCustomerId: cusProduct.internal_customer_id,
		org,
		env,
		customerId: null,
		scenario: AttachScenario.New,
		cusProduct: futureProduct,
	});

	return futureProduct;
};

export const searchCusProducts = ({
	productId,
	internalProductId,
	internalEntityId,
	cusProducts,
	status,
}: {
	productId?: string;
	internalProductId?: string;
	internalEntityId?: string;
	cusProducts: FullCusProduct[];
	status?: CusProductStatus;
}) => {
	if (!cusProducts) {
		return undefined;
	}
	return cusProducts.find((cusProduct: FullCusProduct) => {
		let prodIdMatch = false;
		if (productId) {
			prodIdMatch = cusProduct.product.id === productId;
		} else if (internalProductId) {
			prodIdMatch = cusProduct.product.internal_id === internalProductId;
		}
		return (
			prodIdMatch &&
			(status ? cusProduct.status === status : true) &&
			(internalEntityId
				? cusProduct.internal_entity_id === internalEntityId
				: nullish(cusProduct.internal_entity_id))
		);
	});
};

export const getMainCusProduct = async ({
	db,
	internalCustomerId,
	productGroup,
}: {
	db: DrizzleCli;
	internalCustomerId: string;
	productGroup?: string;
}) => {
	const cusProducts = await CusProductService.list({
		db,
		internalCustomerId,
		inStatuses: RELEVANT_STATUSES,
	});

	const mainCusProduct = cusProducts.find(
		(cusProduct: FullCusProduct) =>
			!cusProduct.product.is_add_on &&
			(productGroup ? cusProduct.product.group === productGroup : true),
	);

	return mainCusProduct as FullCusProduct;
};

export const getCusProductsWithStripeSubId = ({
	cusProducts,
	stripeSubId,
	curCusProductId,
}: {
	cusProducts: FullCusProduct[];
	stripeSubId: string;
	curCusProductId?: string;
}) => {
	return cusProducts.filter(
		(cusProduct) =>
			cusProduct.subscription_ids?.includes(stripeSubId) &&
			cusProduct.id !== curCusProductId,
	);
};

export const getFeatureQuantity = ({
	cusProduct,
	internalFeatureId,
}: {
	cusProduct: FullCusProduct;
	internalFeatureId: string;
}) => {
	const options = cusProduct.options;
	const option = options.find(
		(o) => o.internal_feature_id === internalFeatureId,
	);
	return nullish(option?.quantity) ? 1 : option?.quantity;
};
