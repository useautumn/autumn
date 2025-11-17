import { productV2ToBasePrice } from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { CardHeader } from "@/components/v2/cards/Card";
import {
	useCurrentItem,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useIsEditingPlan, useSheetStore } from "@/hooks/stores/useSheetStore";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { BasePriceDisplay } from "./BasePriceDisplay";
import { PlanCardToolbar } from "./PlanCardToolbar";

const MAX_PLAN_NAME_LENGTH = 20;

export const PlanCardHeader = () => {
	const product = useProductStore((s) => s.product);
	const setSheet = useSheetStore((s) => s.setSheet);
	const isPlanBeingEdited = useIsEditingPlan();

	const item = useCurrentItem();

	const basePrice = productV2ToBasePrice({ product });
	const adminHoverText = () => {
		return [
			{
				key: "Price ID",
				value: basePrice?.price_id || "N/A",
			},
			{
				key: "Stripe Price ID",
				value: basePrice?.price_config?.stripe_price_id || "N/A",
			},
		];
	};

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between w-full">
				<div className="flex flex-row items-center gap-2">
					<AdminHover texts={adminHoverText()} side="top">
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
					onEdit={() => {
						if (item && !checkItemIsValid(item)) {
							return;
						}
						setSheet({ type: "edit-plan", itemId: product.id });
					}}
					editDisabled={isPlanBeingEdited}
				/>
			</div>

			{product.description && (
				<span className="text-sm text-t3 max-w-[80%] line-clamp-2">
					{product.description}
				</span>
			)}

			<BasePriceDisplay />
		</CardHeader>
	);
};
