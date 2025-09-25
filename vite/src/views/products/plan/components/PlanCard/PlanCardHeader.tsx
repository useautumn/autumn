import { mapToProductV3 } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { CardHeader } from "@/components/v2/cards/Card";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanCardToolbar } from "./PlanCardToolbar";

export const PlanCardHeader = () => {
	const { product, setEditingState, setSheet, editingState } =
		useProductContext();

	const productV3 = mapToProductV3({ product });
	const isPlanBeingEdited = editingState.type === "plan";

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between w-full">
				<div className="flex flex-row items-center gap-2">
					<span className="text-main-sec w-fit whitespace-nowrap">
						{product.name}
					</span>
					<CopyButton text={product.id} className="text-xs" size="sm" />
				</div>
				<PlanCardToolbar
					onEdit={() => {
						setEditingState({ type: "plan", id: product.id });
						setSheet("edit-plan");
					}}
					onDelete={() => console.log("Delete plan:", product.id)}
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
					setEditingState({ type: "plan", id: product.id });
					setSheet("edit-plan");
				}}
				disabled={isPlanBeingEdited}
				className="mt-2 !opacity-100"
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
