import { useAxiosSWR, usePostSWR } from "@/services/useAxiosSwr";
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

  const { data, isLoading: queryLoading } = usePostSWR({
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
    },
  });

  return {
    customer: data?.customer,
    features: featuresData?.features || [],
    featuresLoading,
    queryLoading,
    events: data?.events,
  };
};
