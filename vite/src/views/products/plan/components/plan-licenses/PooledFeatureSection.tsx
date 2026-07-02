import {
	type Feature,
	FeatureType,
	isFeaturePriceItem,
	isLicenseProduct,
	type ProductItem,
} from "@autumn/shared";
import { AreaCheckbox } from "@autumn/ui";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	useIsLicenseDraftSeeded,
	useLicenseDraftStore,
} from "./useLicenseDraftStore";

const isPoolableLicenseItem = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature: Feature | null | undefined;
}) =>
	Boolean(feature) &&
	feature?.type !== FeatureType.Boolean &&
	typeof item.included_usage === "number" &&
	item.included_usage > 0 &&
	item.interval != null &&
	!isFeaturePriceItem(item) &&
	!item.entity_feature_id;

/**
 * "Pooled" toggle for a license feature, shown in its feature sheet. The
 * selection is a draft (seeded by the license card) that persists when the
 * plan is saved. Renders nothing outside a plan-license editor.
 */
export function PooledFeatureSection() {
	const { product } = useProduct();
	const { item } = useProductItemContext();
	const { features } = useFeaturesQuery();
	const draftPooledIds = useLicenseDraftStore(
		(s) => s.drafts[product.id]?.pooledFeatureIds,
	);
	const patchDraft = useLicenseDraftStore((s) => s.patch);
	const isSeeded = useIsLicenseDraftSeeded(product.id);

	if (!isLicenseProduct({ product }) || !isSeeded || !item) return null;

	const featureId = item.feature_id;
	const feature = getFeature(featureId ?? undefined, features);
	if (!featureId || !isPoolableLicenseItem({ item, feature })) return null;

	const pooledIds = draftPooledIds ?? [];
	const isPooled = pooledIds.includes(featureId);

	const togglePooled = (checked: boolean) => {
		const nextPooledIds = checked
			? [...pooledIds, featureId]
			: pooledIds.filter((id) => id !== featureId);
		patchDraft(product.id, { pooledFeatureIds: nextPooledIds });
	};

	return (
		<SheetSection title="Pooling">
			<AreaCheckbox
				title="Pooled"
				description="Grant a shared customer-level balance sized by license quantity, instead of per-seat."
				checked={isPooled}
				onCheckedChange={togglePooled}
			/>
		</SheetSection>
	);
}
