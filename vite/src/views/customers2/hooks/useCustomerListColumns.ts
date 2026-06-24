import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import {
	type ColumnGroup,
	getVisibleUsageColumnsFromStorage,
} from "@autumn/ui";
import {
	BASE_COLUMN_IDS,
	createCustomerListColumns,
	createProductVersionColumn,
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

		const productsIndex = baseColumns.findIndex(
			(col) => col.id === "customer_products",
		);
		const insertAt =
			productsIndex !== -1 ? productsIndex + 1 : baseColumns.length;
		const columnsWithVersion = [
			...baseColumns.slice(0, insertAt),
			createProductVersionColumn(),
			...baseColumns.slice(insertAt),
		];

		// Insert usage columns before created_at (so created_at and actions stay at the end)
		const createdAtIndex = columnsWithVersion.findIndex(
			(col) => col.id === "created_at",
		);

		let allColumns: typeof columnsWithVersion;
		if (createdAtIndex !== -1 && usageColumns.length > 0) {
			allColumns = [
				...columnsWithVersion.slice(0, createdAtIndex),
				...usageColumns,
				...columnsWithVersion.slice(createdAtIndex),
			];
		} else {
			allColumns = [...columnsWithVersion, ...usageColumns];
		}

		return {
			columns: allColumns,
			defaultVisibleColumnIds: BASE_COLUMN_IDS,
			columnGroups,
		};
	}, [features, storageKey]);
}
