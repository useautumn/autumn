"use client";

import React, { useEffect, useState } from "react";
import { FeaturesContext } from "./FeaturesContext";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { Feature, FeatureType } from "@autumn/shared";
import { CreateFeature } from "./CreateFeature";
import { AppEnv } from "@autumn/shared";
import LoadingScreen from "../general/LoadingScreen";
import { FeaturesTable } from "./FeaturesTable";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { FeatureRowToolbar } from "./FeatureRowToolbar";
import { FeatureTypeBadge } from "./FeatureTypeBadge";
import UpdateFeature from "./UpdateFeature";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBarsFilter } from "@fortawesome/pro-regular-svg-icons";
import { faDollarCircle } from "@fortawesome/pro-duotone-svg-icons";
import { cn } from "@/lib/utils";
import { CreditSystemsTable } from "../credits/CreditSystemsTable";
import CreateCreditSystem from "../credits/CreateCreditSystem";

function FeaturesView({ env }: { env: AppEnv }) {
  const [showCredits, setShowCredits] = useState(false);
  // const [open, setOpen] = useState(false);
  // const [selectedFeature, setSelectedFeature] = useState<any>(null);

  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
  });

  const creditSystems = data?.features.filter(
    (feature: Feature) => feature.type === FeatureType.CreditSystem
  );

  useEffect(() => {
    if (creditSystems?.length > 0) {
      setShowCredits(true);
    }
  }, [creditSystems]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  // const handleRowClick = (id: string) => {
  //   const feature = data?.features.find(
  //     (feature: Feature) => feature.id === id
  //   );
  //   setSelectedFeature(feature);
  //   setOpen(true);
  // };

  const features = data?.features.filter(
    (feature: Feature) => feature.type !== "credit_system"
  );

  // const getMeteredEventNames = (feature: Feature) => {
  //   if (feature.type !== FeatureType.Metered) return "";

  //   if (!feature.config.filters || feature.config.filters.length === 0)
  //     return "";

  //   return feature.config.filters[0].value.join(", ");
  // };

  return (
    <FeaturesContext.Provider
      value={{
        features: features,
        dbConns: data?.dbConns,
        env,
        mutate,
        creditSystems: creditSystems,
      }}
    >
      <CustomToaster />
      <div>
        <h1 className="text-t1 text-xl font-medium">Features</h1>
        <div className="flex justify-between items-center">
          <p className="text-sm text-t2">
            Define the features of your application you want to charge for.
          </p>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "text-t3 w-fit",
              showCredits && "bg-zinc-200 text-t2 hover:bg-zinc-200"
            )}
            disabled={creditSystems.length > 0}
            onClick={() =>
              setShowCredits(creditSystems.length > 0 ? true : !showCredits)
            }
          >
            <FontAwesomeIcon icon={faDollarCircle} className="mr-2" />
            Credit Systems
          </Button>
        </div>
      </div>

      <FeaturesTable />
      <CreateFeature />

      {showCredits && (
        <div className="flex flex-col gap-4 h-fit mt-6">
          <div>
            <h2 className="text-lg font-medium">Credits</h2>
            <p className="text-sm text-t2">
              Create a credit-based system where features consume credits from a
              shared balance{" "}
              <span className="text-t3">
                (eg, 1 AI chat message costs 3 credits).
              </span>
            </p>
          </div>
          <CreditSystemsTable />
          <CreateCreditSystem />
        </div>
      )}
    </FeaturesContext.Provider>
  );
}

export default FeaturesView;
