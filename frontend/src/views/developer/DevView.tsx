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
import { AppPortal } from "svix-react";
import { useEntitled } from "@/hooks/useEntitled";

import "svix-react/style.css";

export default function DevScreen({ env }: { env: AppEnv }) {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/dev/data",
    env: env,
    withAuth: true,
  });

  // Get entitled
  const { entitled, loading, error } = useEntitled({
    customerId: data?.org?.id,
    featureId: "webhooks",
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
          API keys are used to securely authenticate your requests to the API
          from your server. Learn more{" "}
          <a
            className="text-primary hover:text-primary/80 cursor-pointer"
            href="https://docs.useautumn.com"
            target="_blank"
          >
            here
          </a>
        </p>
      </div>

      {apiKeys.length > 0 && <APIKeyTable apiKeys={apiKeys} />}

      <CreateAPIKey />

      <div className="mt-4">
        <h1 className="text-lg font-medium">Publishable Key</h1>
        <p className="text-sm text-t2">
          Publishable keys are used to make requests to our public API. You can
          safely use this from your frontend.
        </p>
        <div className="flex flex-col gap-2 mt-4">
          {env === AppEnv.Sandbox ? (
            <CopyPublishableKey type="Sandbox" value={data?.org?.test_pkey} />
          ) : (
            <CopyPublishableKey
              type="Production"
              value={data?.org?.live_pkey}
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <h1 className="text-lg font-medium mb-4">Webhooks</h1>
        <div className="h-fit w-full -translate-x-6">
          <AppPortal
            url={data?.svix_dashboard_url}
            style={{
              width: "105%",
              height: "100%",
            }}
            fullSize={true}
          />
        </div>
      </div>
    </DevContext.Provider>
  );
}

const CopyPublishableKey = ({
  type,
  value,
}: {
  type: "Sandbox" | "Production";
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
