import { useAxiosSWR, usePostSWR } from "@/services/useAxiosSwr";
import { ErrCode, FullCustomer } from "@autumn/shared";
import { useSearchParams } from "react-router";

export const useAnalyticsData = () => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customer_id");
  const featureIds = searchParams.get("feature_ids")?.split(",");
  const eventNames = searchParams.get("event_names")?.split(",");
  const interval = searchParams.get("interval");

  const { data: featuresData, isLoading: featuresLoading } = useAxiosSWR({
    url: `/features`,
    options: {
      refreshInterval: 0,
    },
  });

  // Create a simple queryKey with the actual values that change
  const queryKey = [
    "query-events",
    customerId,
    interval,
    ...(eventNames || []).sort(),
    ...(featureIds || []).sort(),
  ];

  console.log("Query key:", queryKey);

  const { data, isLoading: queryLoading, error } = usePostSWR({
    url: `/query/events`,
    data: {
      customer_id: customerId,
      interval,
      event_names: [...(eventNames || []), ...(featureIds || [])],
    },
    enabled: !!customerId,
    queryKey,
    options: {
      refreshInterval: 0,
      onError: (error) => {
        if (error.code === ErrCode.ClickHouseDisabled) {
          return error;
        }
      },
    },
  });

  console.log("Raw events:", data?.rawEvents);

  return {
    customer: data?.customer,
    features: featuresData?.features || [],
    featuresLoading,
    queryLoading,
    events: data?.events,
    error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
    bcExclusionFlag: data?.bcExclusionFlag ?? false,
  };
};


export const useRawAnalyticsData = () => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get("customer_id");
  const interval = searchParams.get("interval");

  const { data: featuresData, isLoading: featuresLoading } = useAxiosSWR({
    url: `/features`,
    options: {
      refreshInterval: 0,
    },
  });

  // Create a simple queryKey with the actual values that change
  const queryKey = [
    "query-raw-events",
    customerId,
    interval,
  ];

  console.log("Query key:", queryKey);

  const { data, isLoading: queryLoading, error } = usePostSWR({
    url: `/query/raw`,
    data: {
      customer_id: customerId,
      interval,
    },
    enabled: !!customerId,
    queryKey,
    options: {
      refreshInterval: 0,
      onError: (error) => {
        if (error.code === ErrCode.ClickHouseDisabled) {
          return error;
        }
      },
    },
  });

  console.log("Raw events:", data?.rawEvents);

  return {
    customer: data?.customer,
    features: featuresData?.features || [],
    featuresLoading,
    queryLoading,
    rawEvents: data?.rawEvents,
    error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
  };
};
