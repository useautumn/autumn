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
import { HamburgerMenu, MenuAction } from "@/components/general/table-components/HamburgerMenu";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";

function FeaturesView({ env }: { env: AppEnv }) {
  const [showCredits, setShowCredits] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // const [open, setOpen] = useState(false);
  // const [selectedFeature, setSelectedFeature] = useState<any>(null);

  const { data, isLoading, error, mutate } = useAxiosSWR({
    url: `/features`,
    env: env,
    withAuth: true,
    options: {
      refreshInterval: 0,
    },
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
        showArchived,
        setShowArchived,
        dropdownOpen,
        setDropdownOpen,
      }}
    >
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Features</h1>
        <PageSectionHeader
          title="Features"
          titleComponent={
            <span className="text-t2 px-1 rounded-md bg-stone-200">
              {features?.length || 0}
            </span>
          }
          addButton={
            <>
              <CreateFeatureDialog />
              <HamburgerMenu
                dropdownOpen={dropdownOpen}
                setDropdownOpen={setDropdownOpen}
                actions={[
                  {
                    type: "item",
                    label: showArchived
                      ? "Show Active Features"
                      : "Show Archived Features",
                    onClick: () => setShowArchived(!showArchived),
                  },
                ]}
              />
            </>
          }
        />
        <FeaturesTable />
        {showCredits && (
          <div className="flex flex-col gap-4 h-fit mt-6">
            <div>
              <h2 className="text-lg font-medium">Credits</h2>
              <p className="text-sm text-t2">
                Create a credit-based system where features consume credits from
                a shared balance{" "}
                <span className="text-t3">
                  (eg, 1 AI chat message costs 3 credits).
                </span>
              </p>
            </div>
            <CreditSystemsTable />
            <CreateCreditSystem />
          </div>
        )}
      </div>
    </FeaturesContext.Provider>
  );
}

export default FeaturesView;
