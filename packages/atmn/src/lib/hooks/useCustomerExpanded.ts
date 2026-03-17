import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ApiCustomerExpanded } from "../../views/react/customers/types.js";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * All expand params for full customer data (comma-separated for query string)
 */
const EXPAND_PARAMS = [
	"invoices",
	"rewards",
	"entities",
	"referrals",
	"subscriptions.plan",
	"scheduled_subscriptions.plan",
	"balances.feature",
].join(",");

export interface UseCustomerExpandedOptions {
	/** Customer ID to fetch */
	customerId: string | null;
	/** Environment (sandbox/live) */
	environment?: AppEnv;
	/** Whether to enable the query */
	enabled?: boolean;
	/** Debounce delay in ms (default: 150ms) */
	debounceMs?: number;
}

/**
 * Custom hook to debounce a value
 */
function useDebouncedValue<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => {
			clearTimeout(timer);
		};
	}, [value, delay]);

	return debouncedValue;
}

/**
 * TanStack Query hook for fetching a single customer with all expand params.
 * Use this to lazily load full customer details when the sheet opens.
 *
 * Includes debouncing to prevent excessive API calls during rapid navigation.
 */
export function useCustomerExpanded({
	customerId,
	environment = AppEnv.Sandbox,
	enabled = true,
	debounceMs = 150,
}: UseCustomerExpandedOptions) {
	// Debounce the customer ID to prevent rapid API calls while scrolling
	const debouncedCustomerId = useDebouncedValue(customerId, debounceMs);

	return useQuery({
		queryKey: ["customer", debouncedCustomerId, "expanded", environment],
		queryFn: async () => {
			if (!debouncedCustomerId) {
				throw new Error("Customer ID is required");
			}

			const secretKey = getKey(environment);

			const response = await request<ApiCustomerExpanded>({
				method: "GET",
				path: `/v1/customers/${encodeURIComponent(debouncedCustomerId)}`,
				secretKey,
				queryParams: {
					expand: EXPAND_PARAMS,
				},
			});

			return response;
		},
		enabled: enabled && !!debouncedCustomerId,
		staleTime: 30_000,
		// Don't refetch on window focus for detail views
		refetchOnWindowFocus: false,
	});
}
