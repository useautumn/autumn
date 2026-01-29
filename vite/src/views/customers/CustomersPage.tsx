"use client";

import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetCleanup } from "@/hooks/stores/useSheetStore";
import { CustomerListTable } from "../customers2/components/table/customer-list/CustomerListTable";
import LoadingScreen from "../general/LoadingScreen";
import { CustomersContext } from "./CustomersContext";
import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

function CustomersPage() {
	const { customers } = useCusSearchQuery();

	const { isLoading: productsLoading } = useProductsQuery();
	const resetProductStore = useProductStore((s) => s.reset);
	useSheetCleanup();
	resetProductStore();

	useSavedViewsQuery();
	useFullCusSearchQuery();

	if (productsLoading) {
		return <LoadingScreen />;
	}

	return (
		<CustomersContext.Provider
			value={{
				customers,
			}}
		>
			<div className=" max-h-full px-10 flex flex-col gap-4 h-full relative w-full pb-8 max-w-5xl mx-auto pt-8">
				<CustomerListTable customers={customers} />
			</div>
		</CustomersContext.Provider>
	);
}

export default CustomersPage;
