import type {
	Feature,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { getCusEntBalance, ProductItemFeatureType } from "@autumn/shared";

export interface FeatureBalanceChange {
	featureId: string;
	featureName: string;
	currentBalance: number | "inf" | null;
	newBalance: number | "inf" | null;
	status: "changed" | "added" | "removed";
	display: {
		singular?: string;
		plural?: string;
	};
}

interface FeatureDisplayInfo {
	name: string;
	display: {
		singular?: string;
		plural?: string;
	};
}

/**
 * Product-like type that has optional items array
 */
type ProductWithItems =
	| (ProductV2 & { items?: ProductItem[] })
	| { items?: ProductItem[] }
	| null
	| undefined;

/**
 * Filters product items to only single-use features
 */
export function getSingleUseFeatureItems({
	product,
}: {
	product: ProductWithItems;
}): ProductItem[] {
	if (!product?.items) return [];

	return product.items.filter(
		(item) =>
			item.type === "feature" &&
			item.feature_type === ProductItemFeatureType.SingleUse,
	);
}

/**
 * Creates a map of current balances from customer entitlements
 */
export function createCurrentBalanceMap({
	entitlements,
}: {
	entitlements: FullCusEntWithFullCusProduct[];
}): Map<string, { balance: number; feature: FullCusEntWithFullCusProduct }> {
	const balanceMap = new Map<
		string,
		{ balance: number; feature: FullCusEntWithFullCusProduct }
	>();

	for (const customerEntitlement of entitlements) {
		const featureId = customerEntitlement.entitlement.feature.id;
		const { balance } = getCusEntBalance({
			cusEnt: customerEntitlement,
			entityId: null,
		});
		balanceMap.set(featureId, {
			balance,
			feature: customerEntitlement,
		});
	}

	return balanceMap;
}

/**
 * Creates a map of feature IDs to included usage amounts
 */
export function createIncludedUsageMap({
	featureItems,
}: {
	featureItems: ProductItem[];
}): Map<string, number | "inf"> {
	return new Map(
		featureItems
			.filter((item) => item.feature_id)
			.map((item) => [item.feature_id as string, item.included_usage ?? 0]),
	);
}

/**
 * Creates a map of feature data including usage, feature, and display info
 */
export function createFeatureDataMap({
	featureItems,
}: {
	featureItems: ProductItem[];
}): Map<
	string,
	{
		includedUsage: number | "inf";
		feature: Feature | null | undefined;
		display?: { singular: string; plural: string };
	}
> {
	return new Map(
		featureItems
			.filter((item) => item.feature_id)
			.map((item) => [
				item.feature_id as string,
				{
					includedUsage: item.included_usage ?? 0,
					feature: item.feature as unknown as Feature,
					display: item.feature?.display as
						| { singular: string; plural: string }
						| undefined,
				},
			]),
	);
}

/**
 * Determines the change status for a feature
 */
export function determineChangeStatus({
	hasCurrentFeature,
	hasNewFeature,
}: {
	hasCurrentFeature: boolean;
	hasNewFeature: boolean;
}): "changed" | "added" | "removed" {
	if (hasCurrentFeature && hasNewFeature) return "changed";
	if (hasNewFeature) return "added";
	return "removed";
}

/**
 * Gets feature display information from either new or current feature data
 */
export function getFeatureDisplayInfo({
	newFeatureData,
	currentBalanceData,
}: {
	newFeatureData?: {
		feature: Feature | null | undefined;
		display: { singular?: string; plural?: string };
	};
	currentBalanceData?: { feature: FullCusEntWithFullCusProduct };
}): FeatureDisplayInfo {
	if (newFeatureData?.feature) {
		return {
			name: newFeatureData.feature.name,
			display: newFeatureData.display,
		};
	}

	if (currentBalanceData) {
		return {
			name: currentBalanceData.feature.entitlement.feature.name,
			display: currentBalanceData.feature.entitlement.feature.display || {},
		};
	}

	return { name: "", display: {} };
}

/**
 * Filters customer products based on the current product being replaced
 */
export function filterCustomerProducts({
	customerProducts,
	currentProductId,
}: {
	customerProducts: FullCusProduct[] | null | undefined;
	currentProductId: string | null | undefined;
}): FullCusProduct[] {
	if (!customerProducts) return [];

	if (!currentProductId) return customerProducts;

	return customerProducts.filter((cp) => cp.product_id === currentProductId);
}
