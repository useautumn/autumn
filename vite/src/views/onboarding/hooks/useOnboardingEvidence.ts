import {
	type Feature,
	type FullCustomer,
	LATEST_VERSION,
	type RawEventFromClickHouse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	type ProductListItem,
	useProductsQuery,
} from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { fetchEventsList } from "@/views/customers/customer/analytics/api/fetchEventsList";

const isCapyDev = import.meta.env.VITE_CAPY_DEV === "1";
const CUSTOMER_LIMIT = 20;

export interface OnboardingEvidence {
	products: ProductListItem[];
	features: Feature[];
	customers: FullCustomer[];
	events: RawEventFromClickHouse[];
	isCatalogLoading: boolean;
	isCustomersLoading: boolean;
	isEventsLoading: boolean;
}

export const useOnboardingEvidence = (): OnboardingEvidence => {
	const axiosInstance = useAxiosInstance();
	const latestAxiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const { products, isLoading: productsLoading } = useProductsQuery();
	const { features, isLoading: featuresLoading } = useFeaturesQuery();

	const { data: customersData, isLoading: customersLoading } = useQuery<{
		fullCustomers: FullCustomer[];
	}>({
		queryKey: buildKey(["onboarding-customers"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/customers/all/full_customers",
				{ limit: CUSTOMER_LIMIT },
			);
			return data;
		},
	});

	const { data: eventsData, isLoading: eventsLoading } = useQuery({
		queryKey: buildKey(["onboarding-events"]),
		enabled: !isCapyDev,
		queryFn: () =>
			fetchEventsList({
				axiosInstance: latestAxiosInstance,
				interval: "30d",
			}),
	});

	return {
		products: products as ProductListItem[],
		features,
		customers: customersData?.fullCustomers ?? [],
		events: eventsData?.events ?? [],
		isCatalogLoading: productsLoading || featuresLoading,
		isCustomersLoading: customersLoading,
		isEventsLoading: eventsLoading,
	};
};
