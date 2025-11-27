import type {
	CheckoutResponse,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	ProductItem,
} from "@autumn/shared";
import { getCusEntBalance, ProductItemFeatureType } from "@autumn/shared";
import { useMemo } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import {
	deduplicateEntitlements,
	flattenCustomerEntitlements,
} from "@/views/customers2/components/table/customer-feature-usage/customerFeatureUsageUtils";

interface FeatureBalanceChange {
	featureId: string;
	featureName: string;
	currentBalance: number | null;
	newBalance: number | null;
	status: "changed" | "added" | "removed";
	display: {
		singular?: string;
		plural?: string;
	};
}

export function AttachFeaturePreview({
	previewData,
}: {
	previewData?: CheckoutResponse | null;
}) {
	const { customer } = useCusQuery();

	const featureChanges = useMemo((): FeatureBalanceChange[] => {
		if (!previewData?.product || !customer) return [];

		const currentProduct = previewData.current_product;
		const newProduct = previewData.product;

		// Get customer entitlements and deduplicate to get current balances
		const filteredCustomerProducts =
			customer?.customer_products?.filter((cp: FullCusProduct) => {
				// Filter to only include products matching the current product if it exists
				if (currentProduct) {
					return cp.product_id === currentProduct.id;
				}
				return true;
			}) || [];

		const cusEnts = flattenCustomerEntitlements({
			customerProducts: filteredCustomerProducts,
		});

		const { entitlements: deduplicatedCusEnts } = deduplicateEntitlements({
			entitlements: cusEnts,
			entityId: null,
		});

		// Create a map of current balances
		const currentBalanceMap = new Map<
			string,
			{ balance: number; feature: FullCusEntWithFullCusProduct }
		>();
		for (const cusEnt of deduplicatedCusEnts) {
			const featureId = cusEnt.entitlement.feature.id;
			const { balance } = getCusEntBalance({
				cusEnt,
				entityId: null,
			});
			currentBalanceMap.set(featureId, {
				balance,
				feature: cusEnt,
			});
		}

		// Get feature items from current and new products
		const currentFeatureItems =
			currentProduct?.items?.filter(
				(item: ProductItem) =>
					item.type === "feature" &&
					item.feature_type === ProductItemFeatureType.SingleUse,
			) || [];

		const newFeatureItems =
			newProduct?.items?.filter(
				(item: ProductItem) =>
					item.type === "feature" &&
					item.feature_type === ProductItemFeatureType.SingleUse,
			) || [];

		// Create maps for easy lookup
		const currentFeaturesMap = new Map(
			currentFeatureItems
				.filter((item: ProductItem) => item.feature_id)
				.map((item: ProductItem) => [
					item.feature_id as string,
					item.included_usage || 0,
				]),
		);

		const newFeaturesMap = new Map<
			string,
			{
				includedUsage: number;
				feature: ProductItem["feature"];
				display: Record<string, unknown>;
			}
		>(
			newFeatureItems
				.filter((item: ProductItem) => item.feature_id)
				.map((item: ProductItem) => [
					item.feature_id as string,
					{
						includedUsage: item.included_usage || 0,
						feature: item.feature,
						display: (item.feature?.display as Record<string, unknown>) || {},
					},
				]),
		);

		// Get all unique feature IDs
		const allFeatureIds = new Set([
			...currentFeaturesMap.keys(),
			...newFeaturesMap.keys(),
		]);

		const changes: FeatureBalanceChange[] = [];

		for (const featureId of allFeatureIds) {
			const featureIdStr = String(featureId);
			const currentIncludedUsage = currentFeaturesMap.get(featureIdStr);
			const newFeatureData = newFeaturesMap.get(featureIdStr);
			const currentBalanceData = currentBalanceMap.get(featureIdStr);

			// Use actual current balance if available, otherwise use included usage from product
			const currentBalance: number | null =
				currentBalanceData?.balance ??
				(typeof currentIncludedUsage === "number"
					? currentIncludedUsage
					: null);
			const newBalance: number | null = newFeatureData?.includedUsage ?? null;

			// Determine status
			let status: "changed" | "added" | "removed";
			if (currentIncludedUsage !== undefined && newFeatureData) {
				status = "changed";
			} else if (newFeatureData) {
				status = "added";
			} else {
				status = "removed";
			}

			// Get feature name and display info
			const featureName =
				newFeatureData?.feature?.name ??
				currentBalanceData?.feature.entitlement.feature.name ??
				"";
			const display =
				newFeatureData?.display ??
				(currentBalanceData?.feature.entitlement.feature.display as Record<
					string,
					unknown
				>) ??
				{};

			changes.push({
				featureId: featureIdStr,
				featureName: featureName ?? "",
				currentBalance,
				newBalance,
				status,
				display: display as { singular?: string; plural?: string },
			});
		}

		return changes;
	}, [previewData, customer]);

	if (!featureChanges.length) return null;

	return (
		<div className="space-y-2 pt-3 border-t border-border">
			<div className="text-xs font-medium text-t2 uppercase tracking-wide">
				Balance Changes
			</div>
			<div className="space-y-1.5">
				{featureChanges.map((change) => {
					const displayUnit =
						change.display?.plural ||
						change.display?.singular ||
						change.featureName.toLowerCase();

					return (
						<div
							key={change.featureId}
							className="flex items-center justify-between text-sm"
						>
							<span className="text-t2 capitalize">{displayUnit}</span>
							<div className="flex items-center gap-2">
								{change.status === "removed" ? (
									<span className="text-t3 line-through">
										{change.currentBalance}
									</span>
								) : change.status === "added" ? (
									<span className="text-t1 font-medium">
										{change.newBalance}
									</span>
								) : (
									<>
										<span className="text-t2">{change.currentBalance}</span>
										<span className="text-t3">→</span>
										<span className="text-t1 font-medium">
											{change.newBalance}
										</span>
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
