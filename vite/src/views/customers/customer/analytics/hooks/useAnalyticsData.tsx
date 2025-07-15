import { useAxiosSWR, usePostSWR } from "@/services/useAxiosSwr";
import { navigateTo, nullish } from "@/utils/genUtils";
import { ErrCode, FullCustomer } from "@autumn/shared";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";

export const useAnalyticsData = () => {
  const navigate = useNavigate();
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

  const {
    data: eventNamesData,
    isLoading: eventNamesLoading,
    error: eventNamesError,
  } = usePostSWR({
    method: "get",
    url: `/query/event_names`,
    enabled: nullish(eventNames) && nullish(featureIds),
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

  useEffect(() => {
    if (eventNamesData) {
      searchParams.set("event_names", eventNamesData.eventNames.join(","));
      searchParams.set("feature_ids", eventNamesData.featureIds.join(","));

      navigate(`?${searchParams.toString()}`);
    }
  }, [eventNamesData, searchParams]);

  const {
    data,
    isLoading: queryLoading,
    error,
  } = usePostSWR({
    url: `/query/events`,
    data: {
      customer_id: customerId || null,
      interval,
      event_names: [...(eventNames || []), ...(featureIds || [])],
    },
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
  const queryKey = ["query-raw-events", customerId, interval];

  const {
    data,
    isLoading: queryLoading,
    error,
  } = usePostSWR({
    url: `/query/raw`,
    data: {
      customer_id: customerId || null,
      interval,
    },
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

  return {
    customer: data?.customer,
    features: featuresData?.features || [],
    featuresLoading,
    queryLoading,
    rawEvents: data?.rawEvents,
    error: error?.code === ErrCode.ClickHouseDisabled ? null : error,
  };
};
