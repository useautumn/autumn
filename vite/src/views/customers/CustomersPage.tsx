"use client";

import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetCleanup } from "@/hooks/stores/useSheetStore";
import { CustomerListTable } from "../customers2/components/table/customer-list/CustomerListTable";
import LoadingScreen from "../general/LoadingScreen";
import { OnboardingGuide } from "../onboarding4/OnboardingGuide";
import { CustomersContext } from "./CustomersContext";
import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import {
	restoreCustomerFilters,
	usePersistedFilters,
} from "./hooks/usePersistedFilters";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

function CustomersPage() {
	restoreCustomerFilters();
	const { org } = useOrg();
	const { customers, isLoading: customersLoading } = useCusSearchQuery();
	usePersistedFilters();

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
			<div className="px-4 sm:px-10 flex flex-col relative w-full pb-8 max-w-5xl mx-auto pt-4 sm:pt-8 gap-8">
				<OnboardingGuide />
				<CustomerListTable
					key={org?.id}
					customers={customers}
					isLoading={customersLoading}
				/>
			</div>
		</CustomersContext.Provider>
	);
}

export default CustomersPage;
