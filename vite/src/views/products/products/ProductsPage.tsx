import { useState } from "react";
import { useClearQueryParams } from "@/hooks/common/useClearQueryParams";
import { ProductsAIChatView } from "./components/ProductsAIChatView";
import { ProductsPageHeader } from "./components/ProductsPageHeader";
import {
	type ProductsViewMode,
	ProductsViewToggle,
} from "./components/ProductsViewToggle";
import { ProductListCreateButton } from "./components/product-list/ProductListCreateButton";
import { ProductListMenuButton } from "./components/product-list/ProductListMenuButton";
import { ProductListTable } from "./components/product-list/ProductListTable";

export const ProductsPage = () => {
	// Clean up onboarding-related query params after a delay
	useClearQueryParams({ queryParams: ["step", "product_id"] });

	const [viewMode, setViewMode] = useState<ProductsViewMode>("list");

	return (
		<div className="h-fit max-h-full px-10">
			{/* Shared header - always visible */}
			<ProductsPageHeader>
				<ProductsViewToggle value={viewMode} onValueChange={setViewMode} />
				<ProductListCreateButton />
				<ProductListMenuButton />
			</ProductsPageHeader>

			{/* Conditional content */}
			{viewMode === "list" ? <ProductListTable /> : <ProductsAIChatView />}
		</div>
	);
};
