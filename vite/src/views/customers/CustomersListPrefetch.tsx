import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { CustomerFiltersProvider } from "./hooks/useCustomerFilters";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

const CustomersListQueries = () => {
	useCusSearchQuery();
	useFullCusSearchQuery();
	useSavedViewsQuery();
	return null;
};

/** Mounted by the layout on a direct load of the customers list, so its queries start before the page chunk mounts. */
export const CustomersListPrefetch = () => (
	<CustomerFiltersProvider>
		<CustomersListQueries />
	</CustomerFiltersProvider>
);
