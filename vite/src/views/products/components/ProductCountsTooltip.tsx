import type { Product } from "@autumn/shared";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export const ProductCountsTooltip = ({
	allCounts,
	product,
}: {
	allCounts: any;
	product: Product;
}) => {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<p className="rounded-full text-t3 font-mono py-0">
						{allCounts?.[product.id]?.active || 0}
					</p>
				</TooltipTrigger>
				<TooltipContent
					side="bottom"
					align="start"
					className="bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3"
				>
					{allCounts?.[product.id] &&
						Object.keys(allCounts[product.id]).map((key) => {
							if (key === "active" || key === "custom" || key === "all")
								return null;
							return (
								<div key={key}>
									{keyToTitle(key)}: {allCounts[product.id][key]}
								</div>
							);
						})}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
