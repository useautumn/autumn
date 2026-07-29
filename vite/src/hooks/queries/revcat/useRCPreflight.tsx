import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface RCPreflightPrice {
	amount_micros: number;
	currency: string;
}

export interface RCPreflightItem {
	plan_id: string;
	autumn_name: string;
	autumn_price: RCPreflightPrice | null;
	rc_exists: boolean;
	rc_name: string | null;
	rc_price: RCPreflightPrice | null;
}

export const useRCPreflight = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetcher = async () => {
		try {
			const { data }: { data: { items: RCPreflightItem[] } } =
				await axiosInstance.post("/v1/organization/revenuecat/preflight");
			return data.items || [];
		} catch (_error) {
			return [];
		}
	};

	const {
		data: items = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: buildKey(["revenuecat-preflight"]),
		queryFn: fetcher,
		enabled,
	});

	return { items, isLoading, error, refetch };
};
