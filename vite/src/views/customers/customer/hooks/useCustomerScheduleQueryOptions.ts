import type { FullCustomerSchedule } from "@autumn/shared";
import { queryOptions } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";

type CustomerScheduleResponse = {
	schedule: FullCustomerSchedule | null;
	entity_schedules: Record<string, FullCustomerSchedule>;
};

export const useCustomerScheduleQueryOptions = () => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return queryOptions({
		queryKey: buildKey(["customer-schedule", customer_id]),
		queryFn: async () => {
			try {
				const { data } = await axiosInstance.get<CustomerScheduleResponse>(
					`/customers/${customer_id}/schedule`,
				);
				return data;
			} catch (error) {
				return throwBackendError(error);
			}
		},
		enabled: Boolean(customer_id),
		retry: false,
	});
};
