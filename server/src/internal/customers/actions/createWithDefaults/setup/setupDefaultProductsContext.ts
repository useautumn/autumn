import {
	type CustomerData,
	type FullProduct,
	isFreeProduct,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";

export interface DefaultProductsContext {
	fullProducts: FullProduct[];
	paidProducts: FullProduct[];
	hasPaidProducts: boolean;
}

const getOverrideAutoEnableProduct = async ({
	ctx,
	customerData,
}: {
	ctx: AutumnContext;
	customerData?: CustomerData;
}): Promise<FullProduct | undefined> => {
	const { db, org, env } = ctx;

	if (!customerData?.auto_enable_plan_id) return undefined;

	const plan = await ProductService.getFull({
		db,
		orgId: org.id,
		env,
		idOrInternalId: customerData.auto_enable_plan_id,
	});

	if (!plan)
		throw new ProductNotFoundError({
			productId: customerData.auto_enable_plan_id,
		});

	if (
		!isFreeProduct({ prices: plan.prices }) &&
		!isDefaultTrialFullProduct({ product: plan })
	) {
		throw new RecaseError({
			message: `Auto-enable plan must be a free product, or have a free trial with 'card_required' as false`,
		});
	}

	return plan;
};

export const setupDefaultProductsContext = async ({
	ctx,
	customerData,
}: {
	ctx: AutumnContext;
	customerData?: CustomerData;
}): Promise<DefaultProductsContext> => {
	const { db, org, env } = ctx;

	const autoEnableProduct = await getOverrideAutoEnableProduct({
		ctx,
		customerData,
	});

	if (autoEnableProduct) {
		const autoEnableIsPaid = !isFreeProduct({
			prices: autoEnableProduct.prices,
		});

		return {
			fullProducts: [autoEnableProduct],
			paidProducts: autoEnableIsPaid ? [autoEnableProduct] : [],
			hasPaidProducts: autoEnableIsPaid,
		};
	}

	const defaultProds = await ProductService.listDefault({
		db,
		orgId: org.id,
		env,
	});

	const groups = new Set(defaultProds.map((p) => p.group));
	const groupToDefaultProd: Record<string, FullProduct> = {};

	for (const group of groups) {
		const defaultProdsInGroup = defaultProds.filter((p) => p.group === group);

		if (defaultProdsInGroup.length === 0) continue;

		defaultProdsInGroup.sort((a, _b) => {
			if (isDefaultTrialFullProduct({ product: a })) return -1;
			if (!isFreeProduct({ prices: a.prices })) return -1;
			return 0;
		});

		groupToDefaultProd[group] = defaultProdsInGroup[0];
	}

	let selectedProducts: FullProduct[] = [];
	const internalOptions = customerData?.internal_options;

	if (internalOptions?.default_group) {
		const defaultProd = groupToDefaultProd[internalOptions.default_group];
		selectedProducts = defaultProd ? [defaultProd] : [];
	} else if (internalOptions?.disable_defaults) {
		selectedProducts = [];
	} else {
		selectedProducts = Object.values(groupToDefaultProd);
	}

	// Get paid products (for billing context)
	const paidProducts = selectedProducts.filter(
		(p) =>
			!isFreeProduct({ prices: p.prices }) &&
			isDefaultTrialFullProduct({ product: p }),
	);

	return {
		fullProducts: selectedProducts,
		paidProducts,
		hasPaidProducts: paidProducts.length > 0,
	};
};
