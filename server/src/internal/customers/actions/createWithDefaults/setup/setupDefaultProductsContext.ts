import {
	type CreateCustomerInternalOptions,
	type FullProduct,
	isFreeProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isDefaultTrialFullProduct } from "@/internal/products/productUtils/classifyProduct.js";

export interface DefaultProductsContext {
	fullProducts: FullProduct[];
	paidProducts: FullProduct[];
	hasPaidProducts: boolean;
}

export const setupDefaultProductsContext = async ({
	ctx,
	internalOptions,
}: {
	ctx: AutumnContext;
	internalOptions?: CreateCustomerInternalOptions;
}): Promise<DefaultProductsContext> => {
	const { db, org, env } = ctx;

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
