import type { ProductV2 } from "@autumn/shared";
import { mapToProductV3 } from "@autumn/shared";

import { CurrencyDollarIcon } from "@phosphor-icons/react";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { IconBadge } from "@/components/v2/badges/IconBadge";
import { useEnv } from "@/utils/envUtils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { PlanCardToolbar } from "./PlanCardToolbar";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard({ product }: { product: ProductV2 }) {
	const env = useEnv();
	const { setSheet, editingState, setEditingState } = useProductContext();
	const productV3 = mapToProductV3({ product, env });

	const isPlanBeingEdited =
		editingState.type === "plan" && editingState.id === product.id;

	return (
		<Card className="min-w-[70%] max-w-[90%] bg-card">
			<CardHeader>
				<div className="flex flex-row items-center justify-between gap-2 w-full whitespace-nowrap">
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
				<span className="text-sm text-t3 truncate w-[65%]">
					{productV3.description}
				</span>

				<IconBadge icon={<CurrencyDollarIcon size={14} weight="regular" />}>
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
			<CardContent>
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
