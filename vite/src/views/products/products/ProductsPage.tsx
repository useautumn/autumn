import { useEffect, useState } from "react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { HamburgerMenu } from "@/components/general/table-components/HamburgerMenu";
import { Badge } from "@/components/ui/badge";
import { useClearQueryParams } from "@/hooks/common/useClearQueryParams";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductsQueryState } from "../hooks/useProductsQueryState";
import CreateProductSheet from "./components/CreateProductSheet";
import { ProductsTable } from "./components/ProductsTable";

export const ProductsPage = () => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const { queryStates, setQueryStates } = useProductsQueryState();

	// Clean up onboarding-related query params after a delay
	useClearQueryParams({ queryParams: ["step", "product_id"] });

	const { products } = useProductsQuery();

	// Add keyboard shortcut: N to open create product sheet
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.key === "n" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				const target = e.target as HTMLElement;
				if (
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable
				) {
					return;
				}
				e.preventDefault();
				setCreateSheetOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
				addButton={
					<CreateProductSheet
						open={createSheetOpen}
						onOpenChange={setCreateSheetOpen}
					/>
				}
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
