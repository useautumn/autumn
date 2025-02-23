"use client";

import React, { useContext } from "react";

import { AppEnv, DBConnection, Feature, FeatureType } from "@autumn/shared";
import CreateCreditSystem from "./CreateCreditSystem";
import { useFeaturesContext } from "../features/FeaturesContext";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { CreditsContext } from "./CreditsContext";
import { CreditSystemsTable } from "./CreditSystemsTable";
import { CustomToaster } from "@/components/general/CustomToaster";

function CreditSystemsView({ env }: { env: AppEnv }) {
  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: "/features",
    env: env,
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <CreditsContext.Provider
      value={{
        features: data?.features,
        env: env,
        mutate,
      }}
    >
      <CustomToaster />
      <div>
        <h1 className="text-xl font-medium">Credits</h1>
        <p className="text-sm text-t2">
          Define a credits system to bill for your users' usage. These are made
          of other metered features.
        </p>
      </div>
      <CreditSystemsTable />
      <CreateCreditSystem />
    </CreditsContext.Provider>
  );
}

export default CreditSystemsView;
