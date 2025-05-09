"use client";

import React, { useState } from "react";

import { HomeContext } from "./HomeContext";
import { Toaster } from "react-hot-toast";

export enum HomeTab {
  Features = "features",
  Credits = "credits",
  Plans = "plans",
  Developer = "developer",
}

function HomeView() {
  const [activeTab, setActiveTab] = useState(HomeTab.Plans);
  const [error, setError] = useState<string | null>(null);

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
