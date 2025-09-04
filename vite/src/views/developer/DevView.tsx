"use client";

import "svix-react/style.css";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { AppEnv } from "@autumn/shared";
import { DevContext } from "./DevContext";
import { ApiKeysView } from "./ApiKeys";
import { AppPortal } from "svix-react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { PublishableKeySection } from "./publishable-key";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { ConfigureStripe } from "./configure-stripe/ConfigureStripe";
import { useSecondaryTab } from "@/hooks/common/useSecondaryTab";
import { useAppQueryStates } from "@/hooks/common/useAppQueryStates";

export default function DevScreen({ env }: { env: AppEnv }) {
  const { data, isLoading, mutate } = useAxiosSWR({
    url: "/dev/data",
    env: env,
    withAuth: true,
  });

  // const secondaryTab = useSecondaryTab({ defaultTab: "api_keys" });
  const { queryStates } = useAppQueryStates({ defaultTab: "api_keys" });
  const tab = queryStates.tab;
  const { pkey, webhooks } = useAutumnFlags();

  const apiKeys = data?.api_keys || [];

  if (isLoading) return <LoadingScreen />;

  return (
    <DevContext.Provider value={{ env, mutate, ...data }}>
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Developer</h1>

        {(tab === "api_keys" || !tab) && (
          <div className="flex flex-col gap-16">
            <ApiKeysView apiKeys={apiKeys} />
            {pkey && <PublishableKeySection org={data.org} />}
          </div>
        )}

        {tab === "stripe" && <ConfigureStripe />}
        {tab === "webhooks" && webhooks && (
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
