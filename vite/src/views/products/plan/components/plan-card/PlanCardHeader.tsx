import { mapToProductV3 } from "@autumn/shared";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { CardHeader } from "@/components/v2/cards/Card";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan, useSheetStore } from "@/hooks/stores/useSheetStore";
import { BasePriceDisplay } from "./BasePriceDisplay";
import { PlanCardToolbar } from "./PlanCardToolbar";

const MAX_PLAN_NAME_LENGTH = 20;

export const PlanCardHeader = () => {
	const { org } = useOrg();
	const product = useProductStore((s) => s.product);
	const setSheet = useSheetStore((s) => s.setSheet);
	const isPlanBeingEdited = useIsEditingPlan();

	const productV3 = mapToProductV3({ product });

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between w-full">
				<div className="flex flex-row items-center gap-2">
					<span className="text-main-sec w-fit whitespace-nowrap">
						{product.name.length > MAX_PLAN_NAME_LENGTH
							? `${product.name.slice(0, MAX_PLAN_NAME_LENGTH)}...`
							: product.name}
					</span>
					<PlanTypeBadges
						product={product}
						iconOnly={product.name.length > MAX_PLAN_NAME_LENGTH - 10}
					/>
				</div>
				<PlanCardToolbar
					onEdit={() => {
						setSheet({ type: "edit-plan", itemId: product.id });
					}}
					editDisabled={isPlanBeingEdited}
				/>
			</div>

			{productV3.description && (
				<span className="text-sm text-t3 max-w-[80%] line-clamp-2">
					{productV3.description}
				</span>
			)}

			<BasePriceDisplay />
			{/* <IconButton
				variant="secondary"
				icon={<CrosshairSimpleIcon />}
				onClick={() => {
					setSheet({ type: "edit-plan", itemId: product.id });
				}}
				disabled={true}
				className="mt-2 !opacity-100 pointer-events-none"
			>
				{renderBasePrice()}
			</IconButton> */}
		</CardHeader>
	);
};
