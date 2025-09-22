import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { ProductCounts, ProductV2 } from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";

export const ProductCountsTooltip = ({ product }: { product: ProductV2 }) => {
	const { counts: allCounts } = useProductsQuery();
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<p className="rounded-full text-t3 font-mono py-0">
						{(allCounts && allCounts[product.id]?.active) || 0}
					</p>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					align="start"
					className="bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3"
				>
					{allCounts &&
						allCounts[product.id] &&
						Object.keys(allCounts[product.id]).map((key) => {
							if (key === "active" || key == "custom" || key == "all")
								return null;
							return (
								<div key={key}>
									{keyToTitle(key)}:{" "}
									{allCounts[product.id][key as keyof ProductCounts]}
								</div>
							);
						})}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
