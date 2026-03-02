import {
	numberWithCommas,
	type ProductCounts,
	type ProductV2,
} from "@autumn/shared";
import { useNavigate } from "react-router";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { Button } from "@/components/v2/buttons/Button";
import { InfoRow } from "@/components/v2/InfoRow";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { pushPage } from "@/utils/genUtils";
import { getVersionCounts } from "@/utils/productUtils";

export const ProductCountsTooltip = ({ product }: { product: ProductV2 }) => {
	const navigate = useNavigate();
	const { counts: allCounts, products } = useProductsQuery();
	const activeCount = allCounts?.[product.id]?.active ?? 0;
	const versionCounts = getVersionCounts(products);

	const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		if (activeCount === 0) return;

		// Build version filter for all versions of this product (comma-separated)
		const maxVersion = versionCounts[product.id] || 1;
		const versionKeys = Array.from(
			{ length: maxVersion },
			(_, i) => `${product.id}:${i + 1}`,
		).join(",");

		// Build path via pushPage (handles sandbox prefix, encoding) but navigate
		// ourselves so we can attach state that tells the customers page to skip
		// restoring filters from localStorage.
		const path = pushPage({
			path: `/customers`,
			queryParams: { version: versionKeys },
			preserveParams: false,
		});
		navigate(path, { state: { preAppliedFilters: true } });
	};

	return (
		<Button
			variant="skeleton"
			className="flex items-center gap-1 cursor-pointer"
			onClick={handleClick}
		>
			<p className="font-mono">{numberWithCommas(activeCount)}</p>
			{activeCount > 0 && (
				<InfoTooltip side="bottom" align="start">
					<div className="flex flex-col gap-1">
						{allCounts?.[product.id] &&
							Object.keys(allCounts[product.id])
								.filter((key) => key !== "all")
								.map((key) => (
									<InfoRow
										key={key}
										label={keyToTitle(key)}
										value={allCounts[product.id][key as keyof ProductCounts]}
									/>
								))}
					</div>
				</InfoTooltip>
			)}
		</Button>
	);
};
