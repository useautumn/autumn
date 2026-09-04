import type {
	Feature,
	FullCustomer,
	RawEventFromClickHouse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	type ProductListItem,
	useProductsQuery,
} from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";

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

/**
 * The rows the expanded panels show. Deliberately separate from progress:
 * these are heavier, only matter on the onboarding page, and arriving late
 * changes a panel's contents rather than the checklist's shape.
 */
export const useOnboardingEvidence = (): OnboardingEvidence => {
	const axiosInstance = useAxiosInstance();
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

	const { data: eventsData, isLoading: eventsLoading } = useQuery<{
		rawEvents: { data: RawEventFromClickHouse[] };
	}>({
		queryKey: buildKey(["onboarding-events"]),
		enabled: !isCapyDev,
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/raw", {
				customer_id: null,
				interval: "30d",
			});
			return data;
		},
	});

	return {
		products: products as ProductListItem[],
		features,
		customers: customersData?.fullCustomers ?? [],
		events: eventsData?.rawEvents?.data ?? [],
		isCatalogLoading: productsLoading || featuresLoading,
		isCustomersLoading: customersLoading,
		isEventsLoading: eventsLoading,
	};
};
