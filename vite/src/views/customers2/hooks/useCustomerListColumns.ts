import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import {
	type ColumnGroup,
	getVisibleUsageColumnsFromStorage,
} from "@/hooks/useColumnVisibility";
import {
	BASE_COLUMN_IDS,
	type CustomerWithProducts,
	createCustomerListColumns,
	createUsageColumn,
} from "../components/table/customer-list/CustomerListColumns";

interface UseCustomerListColumnsOptions {
	features: Feature[];
}

export function useCustomerListColumns({
	features,
}: UseCustomerListColumnsOptions) {
	return useMemo(() => {
		const baseColumns = createCustomerListColumns();

		// Filter to only metered features (non-boolean)
		const meteredFeatures = features.filter(
			(f) =>
				f.type === FeatureType.Metered || f.type === FeatureType.CreditSystem,
		);

		// Create usage columns for each metered feature
		const usageColumnsFromFeatures = meteredFeatures.map((feature) =>
			createUsageColumn({
				featureId: feature.id,
				featureName: feature.name,
			}),
		);

		// If features haven't loaded yet, create columns from localStorage with saved names
		let usageColumns = usageColumnsFromFeatures;
		if (meteredFeatures.length === 0) {
			const storedUsageColumns =
				getVisibleUsageColumnsFromStorage("customer-list");
			usageColumns = storedUsageColumns.map(({ featureId, featureName }) =>
				createUsageColumn({
					featureId,
					featureName, // Now uses the saved name from localStorage!
				}),
			);
		}

		// Build column groups for UI organization
		const columnGroups: ColumnGroup[] = [];

		if (usageColumns.length > 0) {
			columnGroups.push({
				key: "usage",
				label: "Usage",
				columnIds: usageColumns.map((col) => col.id as string),
			});
		}

		// Insert usage columns before created_at (so created_at and actions stay at the end)
		const createdAtIndex = baseColumns.findIndex(
			(col) => col.id === "created_at",
		);

		let allColumns: typeof baseColumns;
		if (createdAtIndex !== -1 && usageColumns.length > 0) {
			allColumns = [
				...baseColumns.slice(0, createdAtIndex),
				...usageColumns,
				...baseColumns.slice(createdAtIndex),
			];
		} else {
			allColumns = [...baseColumns, ...usageColumns];
		}

		return {
			columns: allColumns,
			defaultVisibleColumnIds: BASE_COLUMN_IDS,
			columnGroups,
		};
	}, [features]);
}

export type { CustomerWithProducts };
