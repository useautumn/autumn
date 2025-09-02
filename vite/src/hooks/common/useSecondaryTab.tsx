import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

type SecondaryTabType =
  | "api_keys"
  | "stripe"
  | "products"
  | "rewards"
  | "features"
  | "webhooks";

export const useSecondaryTab = ({
  defaultTab,
}: {
  defaultTab?: SecondaryTabType;
}) => {
  const navigate = useNavigate();
  // const [searchParams] = useSearchParams();
  const [queryStates, setQueryStates] = useQueryStates({
    tab: parseAsString.withDefault(defaultTab || ""),
  });

  const [stableStates, setStableStates] = useState(queryStates);

  useEffect(() => {
    // if (defaultTab && !stableStates.tab) {
    //   navigate(`?tab=${defaultTab}`);
    // }
  }, [defaultTab]);

  return (stableStates.tab as SecondaryTabType) || "";
};
