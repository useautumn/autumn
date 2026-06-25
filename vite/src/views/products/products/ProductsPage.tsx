import { useState } from "react";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useClearQueryParams } from "@/hooks/common/useClearQueryParams";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
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
	useClearQueryParams({ queryParams: ["step", "product_id"] });

	const [viewMode, setViewMode] = useState<ProductsViewMode>("list");
	const { products, isLoading } = useProductsQuery();

	const hasPlans = products && products.length > 0;

	if (!isLoading && !hasPlans) {
		return (
			<EmptyState type="plans" actionButton={<ProductListCreateButton />} />
		);
	}

	return (
		<div>
			<ProductsPageHeader>
				<ProductsViewToggle value={viewMode} onValueChange={setViewMode} />
				<ProductListCreateButton />
				<ProductListMenuButton />
			</ProductsPageHeader>
			{viewMode === "list" ? <ProductListTable /> : <ProductsAIChatView />}
		</div>
	);
};
