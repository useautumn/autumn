import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useTopEventNames = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const {
		data: eventNamesData,
		isLoading: eventNamesLoading,
		error: eventNamesError,
	} = useQuery({
		queryKey: buildKey(["query-event-names"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get("/query/event_names");
			return data;
		},
	});

	return {
		topEvents: {
			featureIds: eventNamesData?.featureIds ?? [],
			eventNames: eventNamesData?.eventNames ?? [],
		},
		isLoading: eventNamesLoading,
		error: eventNamesError,
	};
};
