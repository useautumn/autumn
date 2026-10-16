import type { FullCusProduct, FullCustomerSchedule } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCachedCustomer } from "./useCachedCustomer";
import {
	useCustomerQueryOptions,
	useIncludeExpiredLoose,
} from "./useCustomerQueryOptions";
import { useCustomerScheduleQueryOptions } from "./useCustomerScheduleQueryOptions";

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

export const useCusQuery = ({
	enabled = true,
	schedule: fetchSchedule = false,
}: UseCusQueryOptions = {}) => {
	const { customer_id } = useParams();
	const customerQueryOptions = useCustomerQueryOptions();
	const { getCachedCustomer, getLastFetchedCustomer } =
		useCachedCustomer(customer_id);
	const { entityId } = useEntity();

	const cachedCustomer = useMemo(getCachedCustomer, [getCachedCustomer]);

	const entityAlreadyLoaded =
		!entityId ||
		cachedCustomer?.customer_products?.some(
			(cp: FullCusProduct) =>
				cp.entity_id === entityId || cp.internal_entity_id === entityId,
		);

	const effectiveEntityId = entityAlreadyLoaded ? null : entityId;

	const includeExpiredLoose = useIncludeExpiredLoose();

	const {
		data,
		isLoading: customerLoading,
		isFetching: customerFetching,
		isPlaceholderData,
		error,
		refetch,
	} = useQuery({
		...customerQueryOptions({
			customerId: customer_id,
			entityId: effectiveEntityId,
			includeExpiredLoose,
		}),
		enabled: enabled && !!customer_id,
		placeholderData: keepPreviousData,
	});

	const scheduleQueryOptions = useCustomerScheduleQueryOptions();
	const {
		data: scheduleData,
		isLoading: scheduleLoading,
		refetch: refetchSchedule,
	} = useQuery({
		...scheduleQueryOptions,
		enabled: fetchSchedule && enabled && scheduleQueryOptions.enabled,
	});

	const { products, isLoading: productsLoading } = useProductsQuery();
	const { features, isLoading: featuresLoading } = useFeaturesQuery();

	const customer = data?.customer ?? getLastFetchedCustomer() ?? cachedCustomer;

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

	// Entity schedules come from the schedule endpoint rather than
	// `customer.entities`, which is paginated and may omit scheduled entities.
	const schedules = useMemo(() => {
		if (!fetchSchedule) return [];
		const all = [
			scheduleData?.schedule,
			...Object.values(scheduleData?.entity_schedules ?? {}),
		].filter(Boolean) as FullCustomerSchedule[];
		return [...new Map(all.map((s) => [s.id, s])).values()];
	}, [scheduleData, fetchSchedule]);

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
		schedules,
		testClockFrozenTimeMs,
		entities: customerWithSchedules?.entities,
		products,
		features,
		isLoading,
		isFetching: customerFetching,
		isPlaceholderData,
		error,
		refetch,
		refetchSchedule,
	};
};
