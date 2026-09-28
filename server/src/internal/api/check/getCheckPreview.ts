import {
	type CheckResponseV3,
	cusProductToProduct,
	FeaturePreviewScenario,
	type FullCusProduct,
	type FullEntitlement,
	type FullProduct,
} from "@autumn/shared";
import { ProductService } from "@/internal/products/ProductService.js";
import { getProductResponse } from "@/internal/products/productUtils/productResponseUtils/getProductResponse.js";
import {
	sortFullProducts,
	sortProductsByPrice,
} from "@/internal/products/productUtils/sortProductUtils.js";
import {
	isOneOff,
	isProductUpgrade,
} from "@/internal/products/productUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusService } from "../../customers/CusService.js";
import type { CheckData } from "./checkTypes/CheckData.js";

export const getCheckPreview = async ({
	ctx,
	checkResponse,
	checkData,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	checkResponse: CheckResponseV3;
	checkData: CheckData;
	customerId: string;
	entityId?: string;
}) => {
	const { allowed } = checkResponse;
	const { apiBalance, featureToUse: feature } = checkData;

	if (allowed) return null;

	const { db, org, env, features: allFeatures } = ctx;
	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		entityId,
	});

	const cusProducts = fullCus.customer_products;

	const mainCusProds = cusProducts.filter(
		(cp: FullCusProduct) => !cp.product.is_add_on,
	);

	const cusOwnedProducts = mainCusProds.map((cp: FullCusProduct) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	sortProductsByPrice({ products: cusOwnedProducts });

	const highestTierProd =
		cusOwnedProducts.length > 0 ? cusOwnedProducts[0] : null;

	const products: FullProduct[] = await ProductService.getByFeature({
		db,
		internalFeatureId: feature.internal_id,
	});

	sortFullProducts({ products });

	// 1. Get add ons
	const addOns = [];
	for (const addOn of products) {
		if (addOn.is_add_on) {
			if (isOneOff(addOn.prices)) {
				addOns.push(addOn);
			} else if (
				!cusProducts.some((cp: FullCusProduct) => cp.product.id === addOn.id)
			) {
				addOns.push(addOn);
			}
		}
	}

	let mainProds: FullProduct[] = [];
	if (!highestTierProd) {
		mainProds = products.filter((product: FullProduct) => !product.is_add_on);
	} else {
		for (const prod of products) {
			if (prod.is_add_on) {
				continue;
			}
			if (
				mainCusProds.some((cp: FullCusProduct) => cp.product.id === prod.id)
			) {
			} else if (
				isProductUpgrade({
					prices1: highestTierProd.prices,
					prices2: prod.prices,
					usageAlwaysUpgrade: false,
				})
			) {
				mainProds.push(prod);
			}
		}
	}

	const rawProducts = [...mainProds, ...addOns];
	for (const p of rawProducts) {
		p.entitlements = p.entitlements.map((e) => ({
			...e,
			feature: allFeatures.find((f) => f.id === e.feature_id),
		})) as FullEntitlement[];
	}

	const v2Prods = await Promise.all(
		rawProducts.map((p) =>
			getProductResponse({ product: p, features: allFeatures }),
		),
	);

	const scenario = notNullish(apiBalance)
		? FeaturePreviewScenario.UsageLimit
		: FeaturePreviewScenario.FeatureFlag;

	if (mainProds.length === 0 && addOns.length === 0) {
		return {
			scenario,
			title: `Feature Unavailable`,
			feature_id: feature.id,
			feature_name: feature.name,
			message:
				scenario === FeaturePreviewScenario.UsageLimit
					? `You have reached the usage limit for ${feature.name}. Please contact us to increase your limit.`
					: `${feature.name} is not available for your account. Please contact us to enable it.`,

			products: v2Prods,
			upgrade_product_id: null,
		};
	}

	const nextProd = mainProds.length > 0 ? mainProds[0] : addOns[0];

	const title = nextProd.free_trial
		? `Start trial for ${nextProd.name}`
		: !nextProd.is_add_on
			? `Upgrade to ${nextProd.name}`
			: `Purchase ${nextProd.name}`;

	let msg = "";

	if (scenario === FeaturePreviewScenario.UsageLimit) {
		msg = `You have reached the usage limit for ${feature.name.toLowerCase()}.`;

		if (mainProds.length > 0) {
			let prodString = `Please upgrade to ${mainProds[0].name} to continue using this feature.`;
			if (addOns.length > 0) {
				prodString += ` Alternatively, you can purchase the ${addOns[0].name} add on.`;
			}
			msg = `${msg} ${prodString}`;
		} else if (addOns.length > 0) {
			const prodString = `Please purchase the ${addOns[0].name} add on to continue using this feature.`;
			msg = `${msg} ${prodString}`;
		}
	}
	// If it will be a new feature...
	else {
		msg = `Your current plan does not include the ${feature.name} feature.`;

		if (mainProds.length > 0) {
			let prodString = `Please upgrade to ${mainProds[0].name} to use this feature.`;
			if (addOns.length > 0) {
				prodString += ` Alternatively, you can purchase the ${addOns[0].name} add on.`;
			}
			msg = `${msg} ${prodString}`;
		} else if (addOns.length > 0) {
			const prodString = `Please purchase the ${addOns[0].name} add on to use this feature.`;
			msg = `${msg} ${prodString}`;
		}
	}

	const nextTier =
		mainProds.length > 0 ? mainProds[0] : addOns.length > 0 ? addOns[0] : null;

	return {
		title,
		message: msg,
		scenario,
		feature_id: feature.id,
		feature_name: feature.name,
		products: v2Prods,
		// next_tier: nextTierResponse,

		// Will depracate
		upgrade_product_id: nextTier?.id || null,
	};
};
