import { productV2ToBasePrice, productV2ToFeatureItems } from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { Button } from "@/components/v2/buttons/Button";
import { CardHeader } from "@/components/v2/cards/card";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { PlanCardToolbar } from "@/views/products/plan/components/plan-card/PlanCardToolbar";
import { useInlineEditorContext } from "./InlineEditorContext";

const MAX_PLAN_NAME_LENGTH = 20;

function InlineBasePriceDisplay() {
	const { product, setSheet, sheetType, itemId } = useInlineEditorContext();
	const { org } = useOrg();

	const isEditingPlanPrice = sheetType === "edit-plan-price";

	// Get current item for validation
	const featureItems = productV2ToFeatureItems({ items: product.items });
	const currentItem = featureItems.find((item) => {
		const actualIndex = product.items?.indexOf(item) ?? -1;
		const currentItemId = getItemId({ item, itemIndex: actualIndex });
		return itemId === currentItemId;
	});

	const priceDisplay = getBasePriceDisplay({
		product,
		currency: org?.default_currency,
		showPlaceholder: true,
	});

	const renderPriceContent = () => {
		switch (priceDisplay.type) {
			case "free":
				return (
					<span className="text-main-sec inline-block">
						{priceDisplay.displayText}
					</span>
				);
			case "price":
				return (
					<span className="text-body-secondary flex items-center gap-1">
						<span className="text-main-sec text-t2 font-semibold">
							{priceDisplay.formattedAmount}
						</span>{" "}
						<span className="mt-0.5">{priceDisplay.intervalText}</span>
					</span>
				);
			case "variable":
				return <span className="text-t3">{priceDisplay.displayText}</span>;
			case "placeholder":
				return (
					<span className="text-t4 text-body-secondary inline-block">
						{priceDisplay.displayText}
					</span>
				);
		}
	};

	return (
		<Button
			variant="secondary"
			size="default"
			className={cn(
				"items-center h-9 gap-1 rounded-xl px-2.5 hover:z-95",
				isEditingPlanPrice && "btn-secondary-active z-95",
			)}
			onClick={() => {
				if (currentItem && !checkItemIsValid(currentItem)) return;
				setSheet({ type: "edit-plan-price", itemId: product.id });
			}}
		>
			{renderPriceContent()}
		</Button>
	);
}

export function InlinePlanCardHeader() {
	const { product, setSheet, sheetType } = useInlineEditorContext();
	const isPlanBeingEdited = sheetType === "edit-plan";

	const basePrice = productV2ToBasePrice({ product });

	const adminHoverData = [
		{ key: "Price ID", value: basePrice?.price_id || "N/A" },
		{
			key: "Stripe Price ID",
			value: basePrice?.price_config?.stripe_price_id || "N/A",
		},
	];

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between w-full">
				<div className="flex flex-row items-center gap-2">
					<AdminHover texts={adminHoverData} side="top">
						<span className="text-main-sec w-fit whitespace-nowrap">
							{product.name.length > MAX_PLAN_NAME_LENGTH
								? `${product.name.slice(0, MAX_PLAN_NAME_LENGTH)}...`
								: product.name}
						</span>
					</AdminHover>
					<PlanTypeBadges
						product={product}
						iconOnly={product.name.length > MAX_PLAN_NAME_LENGTH - 10}
					/>
				</div>
				<PlanCardToolbar
					onEdit={() => setSheet({ type: "edit-plan", itemId: product.id })}
					editDisabled={isPlanBeingEdited}
				/>
			</div>

			{product.description && (
				<span className="text-sm text-t3 max-w-[80%] line-clamp-2">
					{product.description}
				</span>
			)}

			<InlineBasePriceDisplay />
		</CardHeader>
	);
}
