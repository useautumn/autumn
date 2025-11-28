import type { Feature, FullCustomer } from "@autumn/shared";
import { useMemo } from "react";
import {
	deduplicateEntitlements,
	flattenCustomerEntitlements,
} from "@/views/customers2/components/table/customer-feature-usage/customerFeatureUsageUtils";
import {
	createCurrentBalanceMap,
	createFeatureDataMap,
	createIncludedUsageMap,
	determineChangeStatus,
	type FeatureBalanceChange,
	filterCustomerProducts,
	getFeatureDisplayInfo,
	getSingleUseFeatureItems,
} from "./attach-feature-preview-utils";
import type { AttachPreviewData } from "./use-attach-preview";

/**
 * Calculates feature balance changes when attaching a product
 */
export function useFeatureBalanceChanges({
	customer,
	previewData,
}: {
	customer: FullCustomer | null | undefined;
	previewData: AttachPreviewData | null | undefined;
}): FeatureBalanceChange[] {
	return useMemo((): FeatureBalanceChange[] => {
		if (!previewData?.product || !customer) return [];

		const currentProduct = previewData.current_product;
		const newProduct = previewData.product;

		// Filter customer products to only those matching the current product
		const filteredCustomerProducts = filterCustomerProducts({
			customerProducts: customer.customer_products,
			currentProductId: currentProduct?.id,
		});

		// Get flattened customer entitlements
		const customerEntitlements = flattenCustomerEntitlements({
			customerProducts: filteredCustomerProducts,
		});

		// Deduplicate entitlements to get current balances
		const { entitlements: deduplicatedEntitlements } = deduplicateEntitlements({
			entitlements: customerEntitlements,
			entityId: null,
		});

		// Create map of current balances
		const currentBalanceMap = createCurrentBalanceMap({
			entitlements: deduplicatedEntitlements,
		});

		// Get feature items from current and new products
		const currentFeatureItems = getSingleUseFeatureItems({
			product: currentProduct,
		});
		const newFeatureItems = getSingleUseFeatureItems({ product: newProduct });

		// Create maps for easy lookup
		const currentFeaturesMap = createIncludedUsageMap({
			featureItems: currentFeatureItems,
		});
		const newFeaturesMap = createFeatureDataMap({
			featureItems: newFeatureItems,
		});

		// Get all unique feature IDs
		const allFeatureIds = new Set([
			...Array.from(currentFeaturesMap.keys()),
			...Array.from(newFeaturesMap.keys()),
		]);

		const changes: FeatureBalanceChange[] = [];

		for (const featureId of Array.from(allFeatureIds)) {
			const currentIncludedUsage = currentFeaturesMap.get(featureId);
			const newFeatureData = newFeaturesMap.get(featureId);
			const currentBalanceData = currentBalanceMap.get(featureId);

			// Use actual current balance if available, otherwise use included usage from product
			const currentBalance =
				currentBalanceData?.balance ?? currentIncludedUsage ?? null;
			const newBalance = newFeatureData?.includedUsage ?? null;

			// Determine status
			const status = determineChangeStatus({
				hasCurrentFeature: currentIncludedUsage !== undefined,
				hasNewFeature: !!newFeatureData,
			});

			// Get feature name and display info
			const { name: featureName, display } = getFeatureDisplayInfo({
				newFeatureData: newFeatureData as {
					feature: Feature;
					display: { singular: string; plural: string };
				},
				currentBalanceData,
			});

			changes.push({
				featureId,
				featureName,
				currentBalance,
				newBalance,
				status,
				display,
			});
		}

		return changes;
	}, [previewData, customer]);
}
