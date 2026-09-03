import type { StripePriceSearchResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const STRIPE_PRICE_ID_PREFIX = "price_";
const STRIPE_PRODUCT_ID_PREFIX = "prod_";

/** Stripe cannot match price ids by substring, so nothing else is a lookup. */
export const isStripeLookup = (search: string) =>
	search.startsWith(STRIPE_PRICE_ID_PREFIX) ||
	search.startsWith(STRIPE_PRODUCT_ID_PREFIX);

/**
 * Two lookups only: an exact price id, or every price under a product id.
 * Anything else never reaches the server.
 */
export const useStripePricesSearchQuery = ({
	search,
	enabled = true,
}: {
	search: string;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const normalizedSearch = search.trim();
	const isLookup = isStripeLookup(normalizedSearch);

	const { data, isFetching, isPlaceholderData, error } =
		useQuery<StripePriceSearchResponse>({
			queryKey: buildKey(["stripe-prices-search", normalizedSearch]),
			enabled: enabled && isLookup,
			queryFn: async () => {
				const { data } = await axiosInstance.get<StripePriceSearchResponse>(
					"/v1/organization/stripe/prices/search",
					{ params: { search: normalizedSearch } },
				);
				return data;
			},
			placeholderData: keepPreviousData,
		});

	return {
		stripePrices: isLookup ? (data?.stripe_prices ?? []) : [],
		isLookup,
		isFetching: isLookup && (isFetching || isPlaceholderData),
		error,
	};
};
