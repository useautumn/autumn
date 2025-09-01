import { useEffect } from "react";
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
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (defaultTab && !searchParams.get("tab")) {
      navigate(`?tab=${defaultTab}`);
    }
  }, [defaultTab]);

  return (searchParams.get("tab") as SecondaryTabType) || "";
};
