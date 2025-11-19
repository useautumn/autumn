import { ErrCode } from "@autumn/shared";
import { useParams } from "react-router";
import { usePostSWR } from "@/services/useAxiosSwr";

export const useCustomerRawEvents = ({
	interval = "30d",
}: {
	interval?: "24h" | "7d" | "30d" | "90d";
}) => {
	const { customer_id } = useParams();

	const { data, isLoading, error } = usePostSWR({
		url: `/query/raw`,
		data: {
			customer_id: customer_id || null,
			interval,
		},
		queryKey: ["customer-raw-events", customer_id, interval],
		options: {
			refreshInterval: 0,
			onError: (error) => {
				if (error.code === ErrCode.ClickHouseDisabled) {
					return error;
				}
			},
		},
	});

	return {
		rawEvents: data?.rawEvents?.data || [],
		isLoading,
		error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
	};
};
