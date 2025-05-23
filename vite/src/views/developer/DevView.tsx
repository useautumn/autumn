"use client";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";

import { AppEnv } from "@autumn/shared";

import { DevContext } from "./DevContext";

import "svix-react/style.css";
import { ApiKeysView } from "./ApiKeys";
import { useCustomer } from "autumn-js/react";
import { notNullish } from "@/utils/genUtils";

import { AppPortal } from "svix-react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { PublishableKeySection } from "./publishable-key";

export default function DevScreen({ env }: { env: AppEnv }) {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/dev/data",
    env: env,
    withAuth: true,
  });

  const { customer } = useCustomer();
  const showWebhooks = notNullish(customer?.features.webhooks);
  const showPkey = notNullish(customer?.features.pkey);

  if (isLoading) return <LoadingScreen />;

  const apiKeys = data?.api_keys || [];

  return (
    <DevContext.Provider value={{ env, mutate, ...data }}>
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Developer</h1>

        <div className="flex flex-col gap-16">
          <ApiKeysView apiKeys={apiKeys} />

          {showPkey && <PublishableKeySection org={data.org} />}

          {showWebhooks && (
            <ConfigureWebhookSection dashboardUrl={data.svix_dashboard_url} />
          )}
        </div>
      </div>
    </DevContext.Provider>
  );
}

const ConfigureWebhookSection = ({ dashboardUrl }: any) => {
  return (
    <div className="bg-white">
      <PageSectionHeader title="Webhooks" />

      <AppPortal
        url={dashboardUrl}
        style={{
          height: "100%",
          borderRadius: "none",
          marginTop: "0.5rem",
          // paddingLeft: "1rem",
          // paddingRight: "1rem",
        }}
        fullSize
      />
    </div>
  );
};
