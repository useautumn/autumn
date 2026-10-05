import { type ApiCustomerV5, LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useCustomerAllocationControls = ({
	customerId,
	enabled = true,
}: {
	customerId?: string;
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();
	const queryKey = buildKey(["customer-allocation-config", customerId]);
	const query = useQuery({
		queryKey,
		queryFn: async () =>
			(
				await axiosInstance.get<ApiCustomerV5>(
					`/v1/customers/${encodeURIComponent(customerId ?? "")}`,
				)
			).data,
		enabled: enabled && !!customerId,
	});
	return { ...query, queryKey };
};
