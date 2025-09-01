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
import { useSecondaryTab } from "@/hooks/useSecondaryTab";
import { useAutumnFlags } from "@/hooks/useAutumnFlags";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";

export default function DevScreen({ env }: { env: AppEnv }) {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/dev/data",
    env: env,
    withAuth: true,
  });

  const secondaryTab = useSecondaryTab({ defaultTab: "api_keys" });
  const { pkey, webhooks } = useAutumnFlags();

  const apiKeys = data?.api_keys || [];

  if (isLoading) return <LoadingScreen />;

  return (
    <DevContext.Provider value={{ env, mutate, ...data }}>
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Developer</h1>

        {(secondaryTab === "api_keys" || !secondaryTab) && (
          <div className="flex flex-col gap-16">
            <ApiKeysView apiKeys={apiKeys} />
            {pkey && <PublishableKeySection org={data.org} />}
          </div>
        )}

        {secondaryTab === "stripe" && <ConfigureStripe />}
        {secondaryTab === "webhooks" && webhooks && (
          <ConfigureWebhookSection dashboardUrl={data.svix_dashboard_url} />
        )}
      </div>
    </DevContext.Provider>
  );
}

const ConfigureWebhookSection = ({ dashboardUrl }: any) => {
  return (
    <div className="h-full">
      <PageSectionHeader title="Webhooks" />

      {dashboardUrl ? (
        <AppPortal
          url={dashboardUrl}
          style={{
            height: "100%",
            borderRadius: "none",
            // marginTop: "0.5rem",
            // paddingLeft: "1rem",
            // paddingRight: "1rem",
          }}
          fullSize
        />
      ) : (
        <div className="text-muted-foreground">Dashboard URL not found.</div>
      )}
    </div>
  );
};
