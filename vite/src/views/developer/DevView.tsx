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
      <div className="flex flex-col gap-4 h-fit relative w-full text-sm">
        <h1 className="text-xl font-medium shrink-0 pt-6 pl-10">Developer</h1>

        {/* API Keys Section */}
        <div className="flex flex-col gap-16">
          <div>
            <div className="sticky top-0 z-10 border-y bg-stone-100 px-10 h-10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-sm text-t2 font-medium">Secret API Keys</h2>
                <span className="text-t2 px-1 rounded-md bg-stone-200">
                  {apiKeys.length}
                </span>
              </div>
              <CreateAPIKey />
            </div>

            {apiKeys.length > 0 ? (
              <APIKeyTable apiKeys={apiKeys} />
            ) : (
              <div className="px-10 py-2">
                <p className="text-sm text-t3">
                  API keys are used to securely authenticate your requests from
                  your server. Learn more{" "}
                  <a
                    className="text-primary hover:text-primary/80 cursor-pointer"
                    href="https://docs.useautumn.com"
                    target="_blank"
                  >
                    here
                  </a>
                </p>
              </div>
            )}
          </div>
          {/* Publishable Key Section */}
          <div>
            <div className="border-y bg-stone-100 px-10 h-10 flex items-center">
              <h2 className="text-sm text-t2 font-medium">Publishable Key</h2>
            </div>
            <div className="px-10 py-4 flex flex-col gap-6">
              <p className="text-sm text-t3">
                You can safely use this from your frontend with certain
                endpoints, such as{" "}
                <span className="font-mono text-red-500">/attach</span> and{" "}
                <span className="font-mono text-red-500">/entitled</span>.
              </p>
              <div className="flex flex-col gap-2 w-fit rounded-sm ">
                {env === AppEnv.Sandbox ? (
                  <CopyPublishableKey
                    type="Sandbox"
                    value={data?.org?.test_pkey}
                  />
                ) : (
                  <CopyPublishableKey
                    type="Production"
                    value={data?.org?.live_pkey}
                  />
                )}
              </div>
            </div>
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
    <div className="flex flex-col justify-between gap-2 w-full">
      <div className="flex items-center whitespace-nowrap overflow-hidden">
        <div className="text-sm text-t2">{type} Publishable Key</div>
      </div>
      <div className="flex items-center gap-2 px-2 font-mono bg-stone-100">
        <div className="text-sm text-t2 truncate">{value}</div>
        <CopyButton text={value} />
      </div>
    </div>
  );
};
