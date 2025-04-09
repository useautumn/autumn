"use client";

import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import CreateAPIKey from "./CreateAPIKey";
import { AppEnv } from "@autumn/shared";

import { DevContext } from "./DevContext";
import { APIKeyTable } from "./APIKeyTable";
import CopyButton from "@/components/general/CopyButton";

import "svix-react/style.css";

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
      <div className="p-6 flex flex-col gap-4 max-w-[1048px]">
        <h1 className="text-xl font-medium">Developer</h1>
        <div>
          <h2 className="text-lg font-medium">Secret API Keys</h2>
          <p className="text-sm text-t2">
            API keys are used to securely authenticate your requests from your
            server. Learn more{" "}
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
          <h2 className="text-lg font-medium">Publishable Key</h2>
          <p className="text-sm text-t2">
            You can safely use this from your frontend with certain endpoints,
            such as <span className="font-mono text-red-500">/attach</span> and{" "}
            <span className="font-mono text-red-500">/entitled</span>.
          </p>
          <div className="flex flex-col gap-2 mt-4 w-[450px] border rounded-sm bg-white px-2 py-1">
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
      </div>
    </DevContext.Provider>
  );
}

export const CopyPublishableKey = ({
  type,
  value,
}: {
  type: "Sandbox" | "Production";
  value: string;
}) => {
  return (
    <div className="flex justify-between w-full">
      <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
        <div className="text-sm font-medium">{type} Publishable Key</div>
        <div className="text-sm text-t2 truncate">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
};
