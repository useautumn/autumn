import { FeatureType } from "@autumn/shared";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	useHasItemChanges,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import UpdateFeatureSheet from "@/views/products/features/components/UpdateFeatureSheet";
import UpdateCreditSystemSheet from "@/views/products/features/credit-systems/components/UpdateCreditSystemSheet";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { AdvancedSettings } from "./AdvancedSettings";
import { BillingType } from "./BillingType";
import { IncludedUsage } from "./IncludedUsage";
import { PricedFeatureSettings } from "./PricedFeatureSettings";
import { PriceTiers } from "./PriceTiers";
import { SheetFooterActions } from "./SheetFooterActions";
import { UsageReset } from "./UsageReset";

export function EditPlanFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const { item } = useProductItemContext();
	const { features, refetch } = useFeaturesQuery();
	const { product, setProduct } = useProduct();
	const { setInitialItem } = useSheet();
	const hasItemChanges = useHasItemChanges();
	const [editFeatureOpen, setEditFeatureOpen] = useState(false);

	const handleFeatureUpdateSuccess = async (oldId: string, newId: string) => {
		if (oldId !== newId && product.items) {
			// Wait for features to be refetched to avoid race condition
			await refetch();
			// Update the feature_id in the product item
			const updatedItems = product.items.map((i) =>
				i.feature_id === oldId ? { ...i, feature_id: newId } : i,
			);
			setProduct({ ...product, items: updatedItems });

			// Also update initialItem so it doesn't show as having changes
			if (item?.feature_id === oldId) {
				setInitialItem({ ...item, feature_id: newId });
			}
		}
	};

	const emptyPriceItem =
		item?.usage_model &&
		item.tiers?.length === 1 &&
		item.tiers[0].amount === 0 &&
		!item.included_usage;

	const hasChanges = hasItemChanges && !emptyPriceItem;

	if (!item) {
		return null;
	}

	const feature = getFeature(item?.feature_id ?? "", features);
	const isFeaturePrice = isFeaturePriceItem(item);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Scrollable content area */}
			<div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title={`Configure ${feature?.name}`}
						description={
							<p>
								Define how customers on plan{" "}
								<span className="font-medium text-t1">{product.name}</span> can
								use feature{" "}
								<span className="font-medium text-t1">{feature?.name}</span>
							</p>
						}
						action={
							<IconButton
								variant="muted"
								size="sm"
								icon={<PencilSimpleIcon />}
								onClick={() => setEditFeatureOpen(true)}
							>
								Edit Feature
							</IconButton>
						}
					/>
				)}

				{feature?.type !== FeatureType.Boolean && (
					<>
						<SheetSection title="Feature Type">
							<BillingType />
						</SheetSection>

						<SheetSection
							title={`Grant Amount ${isFeaturePrice ? "(optional)" : ""}`}
						>
							<IncludedUsage />
						</SheetSection>

						{isFeaturePrice && (
							<SheetSection title="Price" className="space-y-8">
								<div>
									<PriceTiers />
									<UsageReset showBillingLabel={true} />
								</div>
								<PricedFeatureSettings />
							</SheetSection>
						)}

						<AdvancedSettings />
					</>
				)}

				{feature?.type === FeatureType.Boolean && (
					<div className="p-4 flex flex-col gap-2 h-full items-center justify-center">
						<h1 className="text-sub">Nothing to do here...</h1>
						<p className="text-body-secondary max-w-[75%]">
							Boolean features are simply included in the
							<br /> product without any further configuration.
						</p>
					</div>
				)}
			</div>

			{/* Footer stays at bottom */}
			<SheetFooterActions hasChanges={hasChanges} />

			{/* Edit Feature Sheet */}
			{feature?.type === FeatureType.CreditSystem ? (
				<UpdateCreditSystemSheet
					open={editFeatureOpen}
					setOpen={setEditFeatureOpen}
					selectedCreditSystem={feature ?? null}
					onSuccess={handleFeatureUpdateSuccess}
				/>
			) : (
				<UpdateFeatureSheet
					open={editFeatureOpen}
					setOpen={setEditFeatureOpen}
					selectedFeature={feature ?? null}
					onSuccess={handleFeatureUpdateSuccess}
				/>
			)}
		</div>
	);
}
