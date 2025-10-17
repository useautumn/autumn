import { mapToProductV3 } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { CardHeader } from "@/components/v2/cards/Card";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useIsEditingPlan, useSheetStore } from "@/hooks/stores/useSheetStore";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanCardToolbar } from "./PlanCardToolbar";

export const PlanCardHeader = () => {
	const navigate = useNavigate();
	const product = useProductStore((s) => s.product);
	const setSheet = useSheetStore((s) => s.setSheet);
	const isPlanBeingEdited = useIsEditingPlan();

	const productV3 = mapToProductV3({ product });

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between w-full">
				<div className="flex flex-row items-center gap-2">
					<span className="text-main-sec w-fit whitespace-nowrap">
						{product.name}
					</span>
					<PlanTypeBadges product={product} />
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

			<IconButton
				variant="secondary"
				icon={<CrosshairSimpleIcon />}
				onClick={() => {
					setSheet({ type: "edit-plan", itemId: product.id });
				}}
				disabled={true}
				className="mt-2 !opacity-100 pointer-events-none"
			>
				{productV3.price?.amount ? (
					<span className="text-sm font-medium text-t2">
						${productV3.price.amount}/
						{keyToTitle(productV3.price.interval ?? "once", {
							exclusionMap: { one_off: "once" },
						}).toLowerCase()}
					</span>
				) : (
					<span className="text-t4 text-sm">No price set</span>
				)}
			</IconButton>
		</CardHeader>
	);
};
