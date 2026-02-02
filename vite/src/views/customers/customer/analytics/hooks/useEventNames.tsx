import { ErrCode } from "@autumn/shared";
import { usePostSWR } from "@/services/useAxiosSwr.js";

export type EventNameWithCount = {
	event_name: string;
	event_count: number;
};

export const useEventNames = (limit?: number) => {
	const {
		data,
		isLoading,
		error,
	} = usePostSWR<{ eventNames: EventNameWithCount[] }>({
		method: "get",
		url: `/query/event_names/list${limit ? `?limit=${limit}` : ""}`,
		queryKey: ["query-event-names-list", limit],
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
		eventNames: data?.eventNames ?? [],
		isLoading,
		error,
	};
};
