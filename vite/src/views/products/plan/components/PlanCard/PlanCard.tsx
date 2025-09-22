import type { ProductV2 } from "@autumn/shared";
import { mapToProductV3 } from "@autumn/shared";
import { CurrencyDollar } from "@phosphor-icons/react";
import { CopyableSpan } from "@/components/general/CopyablePre";
import { Card, CardHeader } from "@/components/ui/card";
import { useEnv } from "@/utils/envUtils";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard({ product }: { product: ProductV2 }) {
	const env = useEnv();
	const productV3 = mapToProductV3({ product, env });

	return (
		<Card className="w-[70%] mx-auto bg-card">
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
					className="inline-flex items-center gap-2 bg-white border border-[#D1D1D1] rounded-md h-[30px] w-fit squircle squircle-1"
					style={{
						padding: "6px 12px",
						boxShadow:
							"0px 4px 4px rgba(0, 0, 0, 0.02), inset 0px -3px 4px rgba(0, 0, 0, 0.04)",
					}}
				>
					<span className="text-[#666666]">
						<CurrencyDollar size={16} weight="regular" />
					</span>
					{productV3.price?.amount ? (
						<span className="text-sm font-medium text-[#444444]">
							${productV3.price.amount}/
							{keyToTitle(productV3.price.interval ?? "once", { exclusionMap: { one_off: "once" } }).toLowerCase()}
						</span>
					) : (
						<span className="text-[#666666] text-sm">No price set</span>
					)}
				</div>
				
				<PlanFeatureList />
			</CardHeader>
		</Card>
	);
}
