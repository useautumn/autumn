"use client";

import React, { useEffect, useState } from "react";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import CreateAPIKey from "./CreateAPIKey";
import { ApiKey, AppEnv } from "@autumn/shared";
import { Toaster } from "react-hot-toast";
import { DevContext } from "./DevContext";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { APIKeyToolbar } from "./APIKeyToolbar";
import { APIKeyTable } from "./APIKeyTable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CopyButton from "@/components/general/CopyButton";

export default function DevScreen({ env }: { env: AppEnv }) {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/dev/data",
    env: env,
    withAuth: true,
  });

  if (isLoading) return <LoadingScreen />;

  const apiKeys = data?.api_keys || [];

  return (
    <DevContext.Provider value={{ env, mutate, ...data }}>
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 2000,
          style: { fontSize: "14px" },
        }}
      />
      <div>
        <h1 className="text-xl font-medium">API Keys</h1>
        <p className="text-sm text-t2">
          API keys are used to authenticate your requests to the API. Learn more{" "}
          <a
            className="text-primary hover:text-primary/80 cursor-pointer"
            href="https://docs.recaseai.com"
            target="_blank"
          >
            here
          </a>
        </p>
      </div>

      {apiKeys.length > 0 && <APIKeyTable apiKeys={apiKeys} />}

      <CreateAPIKey />

      <div>
        <h1 className="text-lg font-medium">Publishable Key</h1>
        <p className="text-sm text-t2">
          Publishable keys are used to authenticate your requests to the API
          from the client.
        </p>
        <div className="flex flex-col gap-2 mt-4">
          <CopyPublishableKey type="Test" value={data?.org?.test_pkey} />
          <CopyPublishableKey type="Live" value={data?.org?.live_pkey} />
        </div>
      </div>
    </DevContext.Provider>
  );
}

const CopyPublishableKey = ({
  type,
  value,
}: {
  type: "Test" | "Live";
  value: string;
}) => {
  return (
    <div className="px-4 py-2 bg-white flex justify-between w-[450px] border rounded-sm">
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium">{type}</div>
        <div className="text-sm text-t2">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
};
