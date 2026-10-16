import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchBalanceSnapshot } from "@/lib/atom/fetchBalanceSnapshot";
import { baseParamsOf, configOf, type PlaygroundSettings } from "../settings";

export const balanceQueryKey = ({ settings }: { settings: PlaygroundSettings }) =>
  ["atom-balance", settings] as const;

export const useBalance = ({ settings }: { settings: PlaygroundSettings }) =>
  useQuery({
    queryKey: balanceQueryKey({ settings }),
    queryFn: () =>
      fetchBalanceSnapshot({ config: configOf({ settings }), ...baseParamsOf({ settings }) }),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
