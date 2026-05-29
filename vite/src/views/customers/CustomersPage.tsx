"use client";

import { PageContainer } from "@/components/general/PageContainer";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { useSheetCleanup } from "@/hooks/stores/useSheetStore";
import { CustomerListTable } from "../customers2/components/table/customer-list/CustomerListTable";
import { OnboardingGuide } from "../onboarding4/OnboardingGuide";
import { CustomersContext } from "./CustomersContext";
import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import {
	CustomerFiltersProvider,
	useCustomerFilters,
} from "./hooks/useCustomerFilters";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

function CustomersPageContent() {
	const { org } = useOrg();
	const { isInitialized } = useCustomerFilters();
	const {
		customers,
		isLoading: customersLoading,
		isFetchingUncached,
	} = useCusSearchQuery();

	const { isLoading: productsLoading } = useProductsQuery();
	const resetProductStore = useProductStore((s) => s.reset);
	useSheetCleanup();
	resetProductStore();

	useSavedViewsQuery();
	useFullCusSearchQuery();

	const hasData = customers && customers.length > 0;
	const isPageLoading =
		!hasData && (!isInitialized || productsLoading || customersLoading);

	return (
		<CustomersContext.Provider value={{ customers: customers ?? [] }}>
			<PageContainer>
				<OnboardingGuide />
				<CustomerListTable
					key={org?.id}
					customers={customers ?? []}
					isFetchingUncached={isPageLoading || isFetchingUncached}
				/>
			</PageContainer>
		</CustomersContext.Provider>
	);
}

export default function CustomersPage() {
	return (
		<CustomerFiltersProvider>
			<CustomersPageContent />
		</CustomerFiltersProvider>
	);
}
