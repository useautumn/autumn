import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ApiCustomerExpanded } from "../../views/react/customers/types.js";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

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
	customerId: string | null;
	environment?: AppEnv;
	enabled?: boolean;
	debounceMs?: number;
}

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

export function useCustomerExpanded({
	customerId,
	environment = AppEnv.Sandbox,
	enabled = true,
	debounceMs = 150,
}: UseCustomerExpandedOptions) {
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
		refetchOnWindowFocus: false,
	});
}
