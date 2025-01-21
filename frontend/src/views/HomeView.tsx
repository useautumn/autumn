"use client";

import React, { useState } from "react";

import { HomeContext } from "./HomeContext";
import { Toaster } from "react-hot-toast";

import { useOrganization, useUser } from "@clerk/nextjs";
import CreateOrgView from "./onboarding/CreateOrgView";

export enum HomeTab {
  Features = "features",
  Credits = "credits",
  Plans = "plans",
  Developer = "developer",
}

function HomeView() {
  const [activeTab, setActiveTab] = useState(HomeTab.Plans);
  const [error, setError] = useState<string | null>(null);
  const { isLoaded: userLoaded, user } = useUser();
  const { isLoaded: orgLoaded, organization } = useOrganization();

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <CreateOrgView />
      </div>
    );
  }

  return (
    <HomeContext.Provider
      value={{
        activeTab,
        setActiveTab,
        error,
        setError,
      }}
    >
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 1000,
          style: { fontSize: "14px" },
        }}
      />
    </HomeContext.Provider>
  );
}

export default HomeView;
