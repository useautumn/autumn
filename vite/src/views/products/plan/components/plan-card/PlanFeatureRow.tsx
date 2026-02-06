/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import type { ProductItem } from "@autumn/shared";
import { getProductItemDisplay } from "@autumn/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useOnboarding3QueryState } from "@/views/onboarding3/hooks/useOnboarding3QueryState";
import { useOnboardingStore } from "@/views/onboarding3/store/useOnboardingStore";
import { OnboardingStep } from "@/views/onboarding3/utils/onboardingUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { PlanFeatureIcon } from "./PlanFeatureIcon";

export const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface PlanFeatureRowProps {
	item: ProductItem;
	onDelete?: (item: ProductItem) => void;
	index: number;
	readOnly?: boolean;
	prepaidQuantity?: number | null;
}

export const PlanFeatureRow = ({
	item: itemProp,
	onDelete: _onDelete,
	index,
	readOnly = false,
	prepaidQuantity,
}: PlanFeatureRowProps) => {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const { setItem } = useProductItemContext();
	const { product, setProduct } = useProduct();
	const { itemId, setSheet } = useSheet();
	const isOnboarding = useOnboardingStore((s) => s.isOnboarding);
	const playgroundMode = useOnboardingStore((s) => s.playgroundMode);
	const { queryStates } = useOnboarding3QueryState();

	const ref = useRef<HTMLDivElement>(null);
	const [isPressed, setIsPressed] = useState(false);

	const isDisabled =
		isOnboarding &&
		(queryStates.step !== OnboardingStep.Playground ||
			playgroundMode !== "edit");

	const item = product.items?.[index] || itemProp;

	const display = getProductItemDisplay({
		item,
		features,
		currency: org?.default_currency || "USD",
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	const feature = features.find((f) => f.id === item.feature_id);
	const hasFeatureName = feature?.name && feature.name.trim() !== "";
	const displayText = hasFeatureName
		? display.primary_text
		: "Name your feature";

	const currentItemId = getItemId({ item, itemIndex: index });
	const isSelected = itemId === currentItemId;

	useEffect(() => {
		if (!isSelected) setIsPressed(false);
	}, [isSelected]);

	useEffect(() => {
		if (itemId !== currentItemId) setIsPressed(false);
	}, [itemId, currentItemId]);

	const handleRowClicked = () => {
		if (readOnly || isDisabled) return;
		const currentItemId = getItemId({ item, itemIndex: index });

		setItem(item);
		setSheet({ type: "edit-feature", itemId: currentItemId });
	};

	const handleDeleteRow = () => {
		const newItems = product.items?.filter((i) => i !== item) || [];

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

			...(item.price_config?.stripe_prepaid_price_v2_id
				? [
						{
							key: "Stripe Prepaid Price V2 ID",
							value: item.price_config?.stripe_prepaid_price_v2_id || "N/A",
						},
					]
				: []),
		];
	};

	const renderContent = (contentRef?: React.Ref<HTMLDivElement>) => (
		<div
			ref={contentRef}
			role="button"
			tabIndex={0}
			{...(isDisabled && { "data-disabled": true })}
			data-pressed={isPressed}
			className={cn(
				"flex items-center w-full group h-10! group/row select-none rounded-xl hover:relative hover:z-95",
				"input-base input-state-open-tiny",
				isDisabled && "pointer-events-none cursor-default",
				isSelected &&
					"border-transparent z-95 relative bg-interative-secondary outline-4! outline-outer-background!",
				isOnboarding && isSelected && "border-primary!",
				readOnly && "pointer-events-none cursor-default",
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
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<AdminHover texts={adminHoverText()}>
					<div className="flex flex-row items-center gap-1 shrink-0 pointer-events-auto">
						<PlanFeatureIcon item={item} position="left" />

						<CustomDotIcon />

						<PlanFeatureIcon item={item} position="right" />
					</div>
				</AdminHover>

				<p className="whitespace-nowrap truncate flex-1 min-w-0">
					<span className={cn("text-body", !hasFeatureName && "text-t4!")}>
						{displayText}
					</span>

					<span className="text-body-secondary"> {display.secondary_text}</span>
				</p>

				<div
					className={cn(
						"flex items-center max-w-0 opacity-0 overflow-hidden group-hover:max-w-[200px] shrink-0",
						isSelected && "max-w-[200px] opacity-100",
						!readOnly && " group-hover:opacity-100",
					)}
				>
					<IconButton
						icon={
							<TrashIcon
								size={16}
								weight="regular"
								className=" group-hover/btn:text-red-500"
							/>
						}
						className="hover:text-red-500"
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
				{prepaidQuantity && (
					<span className="bg-muted px-1 py-0.5 rounded-md">
						x{parseFloat(Number(prepaidQuantity).toFixed(2))}
					</span>
				)}
			</div>
		</div>
	);

	return renderContent(ref);
};
