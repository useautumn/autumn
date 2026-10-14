import { useCusSearchQuery } from "./hooks/useCusSearchQuery";
import { useFullCusSearchQuery } from "./hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "./hooks/useSavedViewsQuery";

/** Mounted by the layout on a direct load of the customers list, so its queries start before the page chunk mounts. */
export const CustomersListPrefetch = () => {
	useCusSearchQuery();
	useFullCusSearchQuery();
	useSavedViewsQuery();
	return null;
};
