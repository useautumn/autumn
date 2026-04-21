import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import { useCachedCustomer } from "./useCachedCustomer";

type UseCusQueryOptions = {
	enabled?: boolean;
	/**
	 * When true, fetches the customer's persisted schedule from the dedicated
	 * schedule endpoint and includes its loading state in `isLoading`.
	 *
	 * Callers that don't need schedule data should leave this false (the default)
	 * to avoid an extra network request and unnecessary loading latency.
	 */
	schedule?: boolean;
};

type ScheduleResponse = {
	schedule: unknown | null;
	entity_schedules: Record<string, unknown>;
};

export const useCusQuery = ({
	enabled = true,
	schedule: fetchSchedule = false,
}: UseCusQueryOptions = {}) => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { getCachedCustomer } = useCachedCustomer(customer_id);

	const cachedCustomer = useMemo(getCachedCustomer, [getCachedCustomer]);

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get(`/customers/${customer_id}`);
			return data;
		} catch (error) {
			throwBackendError(error);
		}
	};

	const {
		data,
		isLoading: customerLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: buildKey(["customer", customer_id]),
		queryFn: fetcher,
		enabled: enabled && !!customer_id,
		retry: false,
	});

	const scheduleFetcher = async (): Promise<ScheduleResponse> => {
		try {
			const { data: scheduleData } = await axiosInstance.get(
				`/customers/${customer_id}/schedule`,
			);
			return scheduleData;
		} catch (error) {
			throwBackendError(error);
			// throwBackendError always throws — this return is unreachable but
			// keeps TypeScript happy about the declared return type.
			return { schedule: null, entity_schedules: {} };
		}
	};

	const {
		data: scheduleData,
		isLoading: scheduleLoading,
		refetch: refetchSchedule,
	} = useQuery({
		queryKey: buildKey(["customer-schedule", customer_id]),
		queryFn: scheduleFetcher,
		enabled: fetchSchedule && enabled && !!customer_id,
		retry: false,
	});

	const { products, isLoading: productsLoading } = useProductsQuery();
	const { features, isLoading: featuresLoading } = useFeaturesQuery();

	const customer = data?.customer || cachedCustomer;

	// Merge schedule(s) onto the customer object in-memory so downstream consumers
	// (which historically read `customer.schedule` and `entity.schedule`) keep
	// working without having to plumb a second data source through every caller.
	const customerWithSchedules = useMemo(() => {
		if (!fetchSchedule || !customer) return customer;
		const entitySchedules = scheduleData?.entity_schedules ?? {};
		const entities = (customer as any).entities?.map((entity: any) => ({
			...entity,
			schedule: entitySchedules[entity.internal_id] ?? undefined,
		}));
		return {
			...customer,
			schedule: scheduleData?.schedule ?? undefined,
			...(entities ? { entities } : {}),
		};
	}, [customer, scheduleData, fetchSchedule]);

	const schedule = fetchSchedule ? scheduleData?.schedule : undefined;
	const testClockFrozenTimeMs: number | undefined =
		data?.test_clock_frozen_time_ms ?? undefined;
	const cusWithCacheLoading = cachedCustomer ? false : customerLoading;

	// Only hang on schedule loading when the caller explicitly opted in —
	// otherwise unrelated consumers would pay the latency cost.
	const isLoading =
		cusWithCacheLoading ||
		productsLoading ||
		featuresLoading ||
		(fetchSchedule && scheduleLoading);

	return {
		customer: customerWithSchedules,
		schedule,
		testClockFrozenTimeMs,
		entities: customerWithSchedules?.entities,
		products,
		features,
		isLoading,
		error,
		refetch,
		refetchSchedule,
	};
};
