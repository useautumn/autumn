import { ErrCode } from "@autumn/shared";
import { useParams } from "react-router";
import { usePostSWR } from "@/services/useAxiosSwr";

export const useCustomerTimeseriesEvents = ({
	interval = "30d",
	eventNames = [],
}: {
	interval?: "24h" | "7d" | "30d" | "90d";
	eventNames?: string[];
}) => {
	const { customer_id } = useParams();

	const { data, isLoading, error } = usePostSWR({
		url: `/query/events`,
		data: {
			customer_id: customer_id || null,
			interval,
			event_names: eventNames,
		},
		queryKey: [
			"customer-timeseries-events",
			customer_id,
			interval,
			...eventNames.sort(),
		],
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
		timeseriesEvents: data?.events,
		isLoading,
		error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
	};
};
