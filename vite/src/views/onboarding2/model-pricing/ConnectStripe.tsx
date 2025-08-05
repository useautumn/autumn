import { ArrowUpRightFromSquare } from "lucide-react";

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
}: {
  mutate: () => Promise<void>;
  productData: any;
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
  const stripeConnected = productData?.org.stripe_connected;
  return (
    <div className="w-full flex flex-col items-center gap-2">
      <p className="text-t2 text-md">
        Connect your Stripe account to checkout and attach a product to a
        customer. Grab your secret key here{" "}
        <a
          href="https://dashboard.stripe.com/test/apikeys"
          target="_blank"
          className="underline"
        >
          here
        </a>
        .
      </p>
      <div className="flex gap-2 w-full">
        <Input
          className="w-8/10"
          placeholder="Stripe secret key (sk_test_...)"
          value={stripeConnected ? "Stripe connected  ✅ " : testApiKey}
          onChange={(e) => setTestApiKey(e.target.value)}
          disabled={stripeConnected}
        />

        <Button
          variant="gradientPrimary"
          className="min-w-44 w-44 max-w-44"
          onClick={handleConnectStripe}
          isLoading={loading}
          disabled={stripeConnected}
        >
          Connect Stripe
        </Button>
      </div>
    </div>
  );
};
