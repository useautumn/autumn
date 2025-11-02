/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay, productV2ToFeatureItems } from "@autumn/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useOnboarding3QueryState } from "@/views/onboarding3/hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "@/views/onboarding3/store/useOnboardingStore";
import { OnboardingStep } from "@/views/onboarding3/utils/onboardingUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

// Custom dot component with bigger height but smaller width
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface PlanFeatureRowProps {
	item: ProductItem;
	onDelete?: (item: ProductItem) => void;
	index: number;
}

export const PlanFeatureRow = ({
	item: itemProp,
	onDelete,
	index,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const { setItem } = useProductItemContext();
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const itemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);
	const playgroundMode = useOnboardingStore((s) => s.playgroundMode);
	const { queryStates } = useOnboarding3QueryState();

	const [isPressed, setIsPressed] = useState(false);

	// Disable interaction if in onboarding and not in playground edit mode
	const isDisabled =
		isOnboarding &&
		(queryStates.step !== OnboardingStep.Playground ||
			playgroundMode !== "edit");

	// Always use the current item from product.items for real-time updates
	const featureItems = productV2ToFeatureItems({ items: product.items });
	const item = featureItems[index] || itemProp;

	const display = getProductItemDisplay({
		item,
		features,
		currency: org?.default_currency || "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	// Check if feature has a name
	const feature = features.find((f) => f.id === item.feature_id);
	const hasFeatureName = feature?.name && feature.name.trim() !== "";
	const displayText = hasFeatureName
		? display.primary_text
		: "Name your feature";

	const currentItemId = getItemId({ item, itemIndex: index });
	const isSelected = itemId === currentItemId;

	// Clear pressed state when this item is no longer selected
	useEffect(() => {
		if (!isSelected) setIsPressed(false);
	}, [isSelected]);

	// Also clear pressed state whenever editing state changes (catches hotkey navigation)
	useEffect(() => {
		if (itemId !== currentItemId) setIsPressed(false);
	}, [itemId, currentItemId]);

	const handleRowClicked = () => {
		if (isDisabled) return;
		const currentItemId = getItemId({ item, itemIndex: index });

		if (isSelected) {
			// If already selected, deselect by going back to edit-plan
			setSheet({ type: "edit-plan" });
		} else {
			// If not selected, select it
			setItem(item);
			setSheet({ type: "edit-feature", itemId: currentItemId });
		}
	};

	const handleDeleteRow = () => {
		const curItems = productV2ToFeatureItems({
			items: product.items,
			withBasePrice: true,
		});
		const newItems = curItems.filter(
			(_i: ProductItem, idx: number) => idx !== index,
		);

		setProduct({ ...product, items: newItems });

		if (isSelected) {
			setSheet({ type: "edit-plan" });
		}
	};

	const adminHoverText = () => {
		return [
			...(item.entitlement_id
				? [
						{
							key: "Entitlement ID",
							value: item.entitlement_id || "N/A",
						},
					]
				: []),
			...(item.price_id
				? [
						{
							key: "Price ID",
							value: item.price_id || "N/A",
						},
					]
				: []),
			...(item.price_config?.stripe_price_id
				? [
						{
							key: "Stripe Price ID",
							value: item.price_config?.stripe_price_id || "N/A",
						},
					]
				: []),
			...(item.price_config?.stripe_empty_price_id
				? [
						{
							key: "Stripe Empty Price ID",
							value: item.price_config?.stripe_empty_price_id || "N/A",
						},
					]
				: []),
			...(item.price_config?.stripe_product_id
				? [
						{
							key: "Stripe Product ID",
							value: item.price_config?.stripe_product_id || "N/A",
						},
					]
				: []),
		];
	};

	return (
		<div
			role="button"
			tabIndex={0}
			data-state={isSelected ? "open" : "closed"}
			{...(isDisabled && { "data-disabled": true })}
			data-pressed={isPressed}
			className={cn(
				"flex items-center w-full group !h-9 group/row select-none outline-none",
				"input-base input-shadow-tiny input-state-open-tiny",
				isDisabled && "pointer-events-none cursor-default",
			)}
			onMouseDown={(e) => {
				if (isDisabled) return;
				if (!(e.target as Element).closest("button")) {
					setIsPressed(true);
				}
			}}
			onMouseUp={() => {
				if (isDisabled) return;
				setIsPressed(false);
			}}
			onMouseLeave={() => {
				if (isDisabled) return;
				setIsPressed(false);
			}}
			onClick={handleRowClicked}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleRowClicked();
				}
			}}
		>
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<AdminHover texts={adminHoverText()}>
					<div className="flex flex-row items-center gap-1 flex-shrink-0">
						<PlanFeatureIcon item={item} position="left" />

						<CustomDotIcon />

						<PlanFeatureIcon item={item} position="right" />
					</div>
				</AdminHover>

				<p className="whitespace-nowrap truncate flex-1 min-w-0">
					<span className={cn("text-body", !hasFeatureName && "!text-t4")}>
						{displayText}
					</span>

					<span className="text-body-secondary">
						{" "}
						{display.secondary_text}
					</span>
				</p>

				<div className={cn(
					"flex items-center gap-2 max-w-0 opacity-0 overflow-hidden group-hover:max-w-[200px] group-hover:opacity-100 transition-all duration-200 flex-shrink-0",
					isSelected && "max-w-[200px] opacity-100"
				)}>
					<CopyButton
						text={item.feature_id || ""}
						disableActive={true}
						size="sm"
						variant="skeleton"
						tabIndex={-1}
						side="bottom"
					/>
					<IconButton
						icon={<TrashIcon size={16} weight="regular" />}
						iconOrientation="center"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							handleDeleteRow();
						}}
						aria-label="Delete feature"
						variant="skeleton"
						disableActive={true}
						tabIndex={-1}
					/>
				</div>

				{/* <div className="group/btn cursor-grab active:cursor-grabbing flex items-center justify-center p-1 w-6 h-6">
					<div className="text-t3 group-hover/btn:text-primary transition-colors">
						<DotsSixVerticalIcon size={16} weight="bold" />
					</div>
				</div> */}
			</div>
		</div>
	);
};
