import { FeatureType, TierBehavior } from "@autumn/shared";
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
import {
	cleanTiersForMode,
	type VolumePricingMode,
} from "../../utils/tierUtils";
import { AdvancedSettings } from "./AdvancedSettings";
import { BillingType } from "./BillingType";
import { IncludedUsage } from "./IncludedUsage";
import { PricedFeatureSettings } from "./PricedFeatureSettings";
import { PriceSectionTitle } from "./PriceSectionTitle";
import { PriceTiers } from "./PriceTiers";
import { SheetFooterActions } from "./SheetFooterActions";
import { UsageReset } from "./UsageReset";

export function EditPlanFeatureSheet({
	isOnboarding,
}: {
	isOnboarding?: boolean;
}) {
	const { item, setItem } = useProductItemContext();
	const { features, refetch } = useFeaturesQuery();
	const { product, setProduct } = useProduct();
	const { setInitialItem } = useSheet();
	const hasItemChanges = useHasItemChanges();
	const [editFeatureOpen, setEditFeatureOpen] = useState(false);

	const volumePricingMode: VolumePricingMode = item?.tiers?.some(
		(t) => t.flat_amount != null,
	)
		? "flat"
		: "per_unit";

	const isVolumeBased = item?.tier_behavior === TierBehavior.VolumeBased;
	const isMultiTier = (item?.tiers?.length ?? 0) > 1;
	const showVolumePricingToggle = isVolumeBased && isMultiTier;

	const handleTierBehaviorChange = (val: string) => {
		const newBehavior = val as TierBehavior;
		const newItem = { ...item, tier_behavior: newBehavior };

		if (newBehavior !== TierBehavior.VolumeBased) {
			if (newItem.tiers) {
				newItem.tiers = newItem.tiers.map((tier) => ({
					...tier,
					flat_amount: undefined,
				}));
			}
		}

		setItem(newItem);
	};

	const handleVolumePricingModeChange = (mode: VolumePricingMode) => {
		if (!item?.tiers) return;

		const migratedTiers = item.tiers.map((tier) => {
			if (mode === "flat") {
				return {
					...tier,
					flat_amount: tier.flat_amount ?? tier.amount,
					amount: 0,
				};
			}
			return {
				...tier,
				amount: tier.amount !== 0 ? tier.amount : (tier.flat_amount ?? 0),
				flat_amount: undefined,
			};
		});

		setItem({ ...item, tiers: migratedTiers });
	};

	const handleBeforeCommit = () => {
		if (!isVolumeBased) return;
		const mode = showVolumePricingToggle ? volumePricingMode : "per_unit";
		const cleaned = cleanTiersForMode({ item, mode });
		setItem(cleaned);
	};

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

	if (!item) {
		return null;
	}

	const feature = getFeature(item?.feature_id ?? "", features);
	const isFeaturePrice = isFeaturePriceItem(item);

	// Allow confirming a priced feature that has a $0 tier (valid zero-price config)
	const isZeroPriceItem =
		isFeaturePrice &&
		item.tiers?.length === 1 &&
		item.tiers[0].amount === 0 &&
		!item.included_usage;

	const hasChanges = hasItemChanges || isZeroPriceItem;

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
							<SheetSection
								title={
									item.tiers && item.tiers.length > 1 ? (
										<PriceSectionTitle
											tierBehavior={
												item.tier_behavior ?? TierBehavior.Graduated
											}
											volumePricingMode={volumePricingMode}
											showVolumePricingToggle={showVolumePricingToggle}
											onTierBehaviorChange={handleTierBehaviorChange}
											onVolumePricingModeChange={handleVolumePricingModeChange}
										/>
									) : (
										"Price"
									)
								}
								className="space-y-3"
							>
								<div>
									<PriceTiers
										volumePricingMode={
											showVolumePricingToggle ? volumePricingMode : undefined
										}
									/>
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
			<SheetFooterActions
				hasChanges={hasChanges}
				onBeforeCommit={handleBeforeCommit}
			/>

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
