import { ArrowUpRightFromSquare } from "lucide-react";

import ConnectStripe, { CurrencySelect } from "../ConnectStripe";
import Step from "@/components/general/OnboardingStep";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { AppEnv } from "@autumn/shared";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

export const ConnectStripeStep = ({
  mutate,
  productData,
  number,
}: {
  mutate: () => Promise<void>;
  productData: any;
  number: number;
}) => {
  const [testApiKey, setTestApiKey] = useState("");

  const [loading, setLoading] = useState(false);

  const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      await OrgService.connectStripe(axiosInstance, {
        testApiKey,
        liveApiKey: testApiKey,
        successUrl: `https://useautumn.com`,
      });

      toast.success("Successfully connected to Stripe");
      await mutate();
    } catch (error) {
      console.log("Failed to connect Stripe", error);
      toast.error(getBackendErr(error, "Failed to connect Stripe"));
    }

    setLoading(false);
  };

  // console.log("productData", productData);
  let stripeConnected = productData?.org.stripe_connected;
  return (
    <Step
      title="Connect your Stripe test account"
      number={number}
      description={
        <p>
          <span>
            Paste in your{" "}
            <a
              className="text-primary underline font-semibold"
              href="https://dashboard.stripe.com/test/apikeys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe Test Key
              <ArrowUpRightFromSquare size={12} className="inline ml-1" />
            </a>{" "}
          </span>
        </p>
      }
    >
      <div className="flex gap-2 w-full">
        <Input
          className="w-8/10"
          placeholder="Stripe Test Key"
          value={stripeConnected ? "Stripe connected  ✅ " : testApiKey}
          onChange={(e) => setTestApiKey(e.target.value)}
          disabled={stripeConnected}
        />
        {/* <CurrencySelect
              className="w-2/10"
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
              disabled={stripeConnected}
            /> */}
        <Button
          variant="gradientPrimary"
          className="min-w-40"
          onClick={handleConnectStripe}
          isLoading={loading}
          disabled={stripeConnected}
        >
          Connect Stripe
        </Button>
      </div>

      {/* <ConnectStripe
          className="w-full lg:w-2/3 min-w-md max-w-lg rounded-sm"
          onboarding={true}
        /> */}
    </Step>
  );
};
