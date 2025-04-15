import { Input } from "@/components/ui/input";

import { CopyPublishableKey } from "@/views/developer/DevView";

import { DevContext } from "@/views/developer/DevContext";

import Step from "@/components/general/OnboardingStep";
import { AppEnv } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
import { useState } from "react";
import CreateAPIKey from "@/views/developer/CreateAPIKey";
import { toast } from "sonner";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "lucide-react";

export const CreateSecretKey = ({
  apiKey,
  setApiKey,
  number,
}: {
  apiKey: string;
  setApiKey: (apiKey: string) => void;
  number: number;
}) => {
  let env = useEnv();
  let [apiKeyName, setApiKeyName] = useState("");
  let [apiCreated, setApiCreated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  let axiosInstance = useAxiosInstance({ env });

  const handleCreate = async () => {
    console.log("creating api key", apiKeyName ? apiKeyName : name);
    setLoading(true);
    try {
      const { api_key } = await DevService.createAPIKey(axiosInstance, {
        name: apiKeyName ? apiKeyName : name,
      });

      setApiKey(api_key);
    } catch (error) {
      console.log("Error:", error);
      toast.error("Failed to create API key");
    }

    setLoading(false);
  };

  return (
    <Step
      title="Create an Autumn Secret Key"
      number={number}
      description={
        <p>
          Create a secret key to authenticate your requests to the Autumn API.
        </p>
      }
    >
      {/* <div className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
          <p>
            Your <span className="font-bold">Publishable Key</span> is safe for
            frontend use. It&apos;s limited to non-sensitive operations, like
            getting a Stripe Checkout URL and feature access checks.
          </p>
          <p>
            Your <span className="font-bold">Secret Key</span> belongs on your
            backend server and has full API access, including for sending usage
            events.
          </p>
        </div> */}

      <DevContext.Provider
        value={{
          mutate: () => {},
          onboarding: true,
          apiKeyName,
          setApiKeyName,
          apiCreated,
          setApiCreated,
        }}
      >
        <div className="flex flex-col gap-2 w-full">
          {apiKey ? (
            <div className="flex gap-2">
              <Input value={apiKey} disabled />
              <Button
                variant="secondary"
                className="text-xs text-t3 flex gap-2 rounded-md shadow-none"
                endIcon={
                  copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />
                }
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                  }, 1000);
                }}
              >
                Copy
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Secret API Key Name"
                value={apiKeyName}
                disabled={apiCreated}
                onChange={(e) => setApiKeyName(e.target.value)}
              />
              <Button
                onClick={handleCreate}
                isLoading={loading}
                variant="gradientPrimary"
                className="min-w-40"
              >
                Create Secret Key
              </Button>
            </div>
          )}
        </div>
      </DevContext.Provider>
    </Step>
  );
};

{
  /* <div className="border rounded-sm px-2 py-1">
                {env === AppEnv.Sandbox ? (
                  <CopyPublishableKey
                    type="Sandbox"
                    value={productData?.org?.test_pkey}
                  />
                ) : (
                  <CopyPublishableKey
                    type="Production"
                    value={productData?.org?.live_pkey}
                  />
                )}
              </div> */
}
