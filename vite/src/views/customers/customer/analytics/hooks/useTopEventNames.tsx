import { usePostSWR } from "@/services/useAxiosSwr.js";
import { ErrCode } from "@autumn/shared";

export const useTopEventNames = () => {
  const {
    data: eventNamesData,
    isLoading: eventNamesLoading,
    error: eventNamesError,
  } = usePostSWR({
    method: "get",
    url: `/query/event_names`,
    queryKey: ["query-event-names"],
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
    topEvents: {
      featureIds: eventNamesData?.featureIds ?? [],
      eventNames: eventNamesData?.eventNames ?? [],
    },
    isLoading: eventNamesLoading,
    error: eventNamesError,
  };
};
