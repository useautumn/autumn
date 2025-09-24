import { mapToProductV3 } from "@autumn/shared";
import { CurrencyDollarIcon } from "@phosphor-icons/react";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { IconBadge } from "@/components/v2/badges/IconBadge";
import { CardHeader } from "@/components/v2/cards/Card";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanCardToolbar } from "./PlanCardToolbar";

export const PlanCardHeader = () => {
	const { product, setEditingState, setSheet, editingState } =
		useProductContext();

	const productV3 = mapToProductV3({ product });
	const isPlanBeingEdited =
		editingState.type === "plan" && editingState.id === product.id;

	return (
		<CardHeader>
			<div className="flex flex-row items-center justify-between gap-4 w-full whitespace-nowrap">
				<div className="flex flex-row items-baseline gap-2">
					<span className="text-main font-medium w-fit whitespace-nowrap">
						{product.name}
					</span>
					<CopyableSpan text={product.id} className="text-xs" copySize={12} />
				</div>
				<PlanCardToolbar
					onEdit={() => {
						console.log("Edit plan:", product.id);
						setEditingState({ type: "plan", id: product.id });
						setSheet("edit-plan");
					}}
					onDelete={() => console.log("Delete plan:", product.id)}
					editDisabled={isPlanBeingEdited}
				/>
			</div>

			<span className="text-sm text-t3">
				Unlock advanced AI chat features with unlimited messages, priority
				support, and custom model fine-tuning capabilities.
			</span>

			<IconBadge
				icon={<CurrencyDollarIcon size={14} weight="regular" />}
				className="mt-1"
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
			</IconBadge>
		</CardHeader>
	);
};
