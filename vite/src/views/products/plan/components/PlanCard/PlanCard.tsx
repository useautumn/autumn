import type { ProductV2 } from "@autumn/shared";
import { mapToProductV3 } from "@autumn/shared";
import { CrosshairSimpleIcon } from "@phosphor-icons/react";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useEnv } from "@/utils/envUtils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard({ product }: { product: ProductV2 }) {
	const env = useEnv();
	const productV3 = mapToProductV3({ product, env });

	return (
		<Card className="w-[70%] max-w-xl bg-card">
			<CardHeader>
				<div className="flex flex-row items-center justify-between gap-2 w-full whitespace-nowrap">
					<div className="flex flex-row items-baseline gap-2">
						<span className="text-main font-medium w-fit whitespace-nowrap">
							{product.name}
						</span>
						<CopyableSpan text={product.id} className="text-xs" copySize={12} />
					</div>
				</div>
				<span className="text-sm text-t3 truncate w-[65%]">
					{productV3.description}
				</span>

				<div
					className="flex text-body items-center gap-1 border border-input w-fit px-1 py-0.5 rounded-lg"
					// style={{
					// 	padding: "6px 12px",
					// 	boxShadow:
					// 		"0px 4px 4px rgba(0, 0, 0, 0.02), inset 0px -3px 4px rgba(0, 0, 0, 0.04)",
					// }}
				>
					<CrosshairSimpleIcon
						size={16}
						weight="regular"
						className="text-icon1"
					/>

					{productV3.price?.amount ? (
						<span className="text-sm font-medium text-[#444444]">
							${productV3.price.amount}/
							{keyToTitle(productV3.price.interval ?? "once", {
								exclusionMap: { one_off: "once" },
							}).toLowerCase()}
						</span>
					) : (
						<span className="text-[#666666] text-sm">No price set</span>
					)}
				</div>
			</CardHeader>
			<CardContent>
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
