import {
	type ProductItem,
	productV2ToFeatureItems,
	sortPlanItems,
	splitBooleanItems,
} from "@autumn/shared";
import { useMemo } from "react";
import { CollapsedBooleanItems } from "@/components/forms/shared/plan-items/CollapsedBooleanItems";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getItemId } from "@/utils/product/productItemUtils";
import { LicensePlanRow } from "../plan-licenses/LicensePlanRow";
import { useResolvedPlanLicenses } from "../plan-licenses/useResolvedPlanLicenses";
import { AddFeatureRow } from "./AddFeatureRow";
import { DummyPlanFeatureRow } from "./DummyPlanFeatureRow";
import { PlanFeatureRow } from "./PlanFeatureRow";

function EntityGroupHeader({ entityFeatureId }: { entityFeatureId: string }) {
	const { features } = useFeaturesQuery();
	const feature = features.find((f) => f.id === entityFeatureId);
	return (
		<div className="text-sm font-medium text-body-secondary px-2 pt-2">
			{feature?.name || entityFeatureId}
		</div>
	);
}

export const PlanFeatureList = ({
	allowAddFeature = true,
}: {
	allowAddFeature?: boolean;
}) => {
	const { product, setProduct } = useProduct();
	const { sheetType, itemId, setSheet } = useSheet();
	const licenses = useResolvedPlanLicenses();

	const filteredItems = useMemo(
		() => (product ? productV2ToFeatureItems({ items: product.items }) : []),
		[product],
	);
	const sortedItems = useMemo(
		() => sortPlanItems({ items: filteredItems }),
		[filteredItems],
	);
	const { visibleItems, collapsedBooleanItems } = useMemo(
		() => splitBooleanItems({ items: sortedItems }),
		[sortedItems],
	);

	if (!product) return null;

	const hasEntityItems = sortedItems.some((i) => i.entity_feature_id);

	const handleDelete = (item: ProductItem) => {
		if (!product.items) return;

		const newItems = product.items.filter((i: ProductItem) => i !== item);
		const updatedProduct = { ...product, items: newItems };
		setProduct(updatedProduct);

		const itemIndex = product.items.findIndex((i: ProductItem) => i === item);
		const currentItemId = getItemId({ item, itemIndex });
		if (itemId === currentItemId) {
			setSheet({ type: "edit-plan" });
		}
	};

	const isCreatingNewFeature = sheetType === "new-feature";

	const renderLicenseRows = () =>
		licenses.map(({ planLicense, license }) => (
			<LicensePlanRow
				key={planLicense.id}
				planLicense={planLicense}
				license={license}
			/>
		));

	if (filteredItems.length === 0) {
		return (
			<div className="space-y-2">
				{renderLicenseRows()}
				{isCreatingNewFeature ? <DummyPlanFeatureRow /> : <AddFeatureRow />}
			</div>
		);
	}

	const renderFeatureRow = (item: ProductItem) => {
		const itemIndex = product.items?.indexOf(item) ?? -1;
		return (
			<PlanFeatureRow
				key={`${getItemId({ item, itemIndex })}-${itemIndex}`}
				item={item}
				index={itemIndex}
				onDelete={handleDelete}
			/>
		);
	};

	const renderVisibleItems = () => {
		const elements: React.ReactNode[] = [];
		let lastEntityId: string | null | undefined;

		for (const item of visibleItems) {
			if (
				hasEntityItems &&
				item.entity_feature_id &&
				item.entity_feature_id !== lastEntityId
			) {
				elements.push(
					<EntityGroupHeader
						key={`header-${item.entity_feature_id}`}
						entityFeatureId={item.entity_feature_id}
					/>,
				);
			}
			lastEntityId = item.entity_feature_id;
			elements.push(renderFeatureRow(item));
		}

		return elements;
	};

	return (
		<div className="space-y-2">
			{renderVisibleItems()}

			{collapsedBooleanItems.length > 0 && (
				<CollapsedBooleanItems
					items={collapsedBooleanItems}
					renderItem={(item) => renderFeatureRow(item)}
				/>
			)}

			{renderLicenseRows()}

			{allowAddFeature &&
				(isCreatingNewFeature ? <DummyPlanFeatureRow /> : <AddFeatureRow />)}
		</div>
	);
};
