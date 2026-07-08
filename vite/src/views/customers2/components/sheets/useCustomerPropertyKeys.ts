import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type CustomerPropertySuggestions = {
	propertyKeys: string[];
	valuesByKey: Record<string, string[]>;
};

const MAX_EVENTS_TO_SCAN = 1000;

const parseProperties = (
	properties: unknown,
): Record<string, unknown> | null => {
	if (typeof properties === "string") {
		try {
			return JSON.parse(properties);
		} catch {
			return null;
		}
	}
	if (properties && typeof properties === "object") {
		return properties as Record<string, unknown>;
	}
	return null;
};

const extractSuggestions = (
	rawEvents: Array<{ properties?: unknown }> | undefined,
): CustomerPropertySuggestions => {
	const valueSets = new Map<string, Set<string>>();

	for (const event of (rawEvents ?? []).slice(0, MAX_EVENTS_TO_SCAN)) {
		const properties = parseProperties(event.properties);
		if (!properties) continue;

		for (const [key, value] of Object.entries(properties)) {
			if (value == null || typeof value === "object") continue;
			const values = valueSets.get(key) ?? new Set<string>();
			values.add(String(value));
			valueSets.set(key, values);
		}
	}

	return {
		propertyKeys: [...valueSets.keys()].sort(),
		valuesByKey: Object.fromEntries(
			[...valueSets.entries()].map(([key, values]) => [
				key,
				[...values].sort(),
			]),
		),
	};
};

/** Property keys and observed values from the customer's recent events, for
 *  condition suggestions and typo warnings. Customer-scoped until an org-wide
 *  property source exists. */
export function useCustomerPropertyKeys({
	customerId,
}: {
	customerId?: string;
}): CustomerPropertySuggestions {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data } = useQuery({
		enabled: !!customerId,
		queryKey: buildKey(["customer-property-keys", customerId]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/raw", {
				customer_id: customerId,
				interval: "90d",
			});
			return data;
		},
		staleTime: 60_000,
	});

	return useMemo(() => extractSuggestions(data?.rawEvents?.data), [data]);
}
