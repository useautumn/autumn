import { useClearQueryParams } from "@/hooks/common/useClearQueryParams";
import { ProductListTable } from "./components/product-list/ProductListTable";

export const ProductsPage = () => {
	// Clean up onboarding-related query params after a delay
	useClearQueryParams({ queryParams: ["step", "product_id"] });

	return (
		<div className="h-fit max-h-full px-10">
			<ProductListTable />
		</div>
	);
};
