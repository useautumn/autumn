"use client";

import React, { useEffect, useState } from "react";
import { FeaturesContext } from "./FeaturesContext";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { Feature, FeatureType } from "@autumn/shared";
import { CreateFeature, CreateFeatureDialog } from "./CreateFeature";
import { AppEnv } from "@autumn/shared";
import LoadingScreen from "../general/LoadingScreen";
import { FeaturesTable } from "./FeaturesTable";

import { CreditSystemsTable } from "../credits/CreditSystemsTable";
import CreateCreditSystem from "../credits/CreateCreditSystem";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import ErrorScreen from "../general/ErrorScreen";
import { Banknote, DollarSign } from "lucide-react";

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

  if (!data || error) {
    return <ErrorScreen>Failed to fetch features</ErrorScreen>;
  }

  const features = data?.features.filter(
    (feature: Feature) => feature.type !== "credit_system"
  );

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
      <div>
        <h1 className="text-t1 text-xl font-medium">Features</h1>
        <div className="flex justify-between items-center">
          <p className="text-sm text-t2">
            Define the features of your application you want to charge for.
          </p>
          <ToggleDisplayButton
            show={showCredits}
            disabled={creditSystems.length > 0}
            onClick={() => setShowCredits(!showCredits)}
          >
            <Banknote size={14} />
            Credit Systems
          </ToggleDisplayButton>
        </div>
      </div>

      <FeaturesTable />
      <CreateFeatureDialog />

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
