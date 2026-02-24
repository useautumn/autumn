import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import {
	type ColumnGroup,
	getVisibleUsageColumnsFromStorage,
} from "@/hooks/useColumnVisibility";
import {
	BASE_COLUMN_IDS,
	createCustomerListColumns,
	createUsageColumn,
} from "../components/table/customer-list/CustomerListColumns";

export function useCustomerListColumns({
	features,
	storageKey,
}: {
	features: Feature[];
	storageKey: string;
}) {
	return useMemo(() => {
		const baseColumns = createCustomerListColumns();

		const meteredFeatures = features.filter(
			(f) =>
				f.type === FeatureType.Metered || f.type === FeatureType.CreditSystem,
		);

		const usageColumnsFromFeatures = meteredFeatures.map((feature) =>
			createUsageColumn({
				featureId: feature.id,
				featureName: feature.name,
			}),
		);

		// Before features load, pre-create columns from localStorage so saved
		// usage columns are present on the very first render (no pop-in).
		let usageColumns = usageColumnsFromFeatures;
		if (meteredFeatures.length === 0) {
			const storedUsageColumns = getVisibleUsageColumnsFromStorage({
				storageKey,
			});
			usageColumns = storedUsageColumns.map(({ featureId, featureName }) =>
				createUsageColumn({ featureId, featureName }),
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
	}, [features, storageKey]);
}
