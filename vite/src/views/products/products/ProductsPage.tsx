import CreateProduct from "./components/CreateProductDialog";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Badge } from "@/components/ui/badge";
import { ProductsTable } from "./components/ProductsTable";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";
import { useState } from "react";
import { useProductsQueryState } from "../hooks/useProductsQueryState";

export const ProductsPage = () => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { queryStates, setQueryStates } = useProductsQueryState();

	const { products } = useProductsQuery();

	return (
		<div>
			<PageSectionHeader
				title="Products"
				titleComponent={
					<>
						<span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
							{products?.length}
						</span>
						{queryStates.showArchivedProducts && (
							<Badge className="shadow-none bg-yellow-100 border-yellow-500 text-yellow-500 hover:bg-yellow-100">
								Archived
							</Badge>
						)}
					</>
				}
				addButton={<CreateProduct />}
				menuComponent={
					<HamburgerMenu
						dropdownOpen={dropdownOpen}
						setDropdownOpen={setDropdownOpen}
						actions={[
							{
								type: "item",
								label: queryStates.showArchivedProducts
									? `Show active products`
									: `Show archived products`,
								onClick: () =>
									setQueryStates({
										...queryStates,
										showArchivedProducts: !queryStates.showArchivedProducts,
									}),
							},
						]}
					/>
				}
			/>
			<ProductsTable />
		</div>
	);
};
