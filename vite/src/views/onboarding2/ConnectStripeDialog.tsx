import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModelPricingContext } from "./model-pricing/ModelPricingContext";

import {
  CustomDialogBody,
  CustomDialogContent,
  CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { connectStripe } from "./utils/connectStripe";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useOrg } from "@/hooks/common/useOrg";

export default function ConnectStripeDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { org, mutate: mutateOrg } = useOrg();

  const axiosInstance = useAxiosInstance();

  const [testApiKey, setTestApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const handleConnectStripe = async () => {
    setLoading(true);
    await connectStripe({ testApiKey, axiosInstance, mutate: mutateOrg });
    setOpen(false);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CustomDialogContent fromTop={false} className="w-lg">
        <CustomDialogBody>
          <DialogHeader>
            <DialogTitle>Connect your Stripe account</DialogTitle>
          </DialogHeader>
          <p className="text-t2 text-sm">
            To add a product to a customer, first connect your Stripe account.
            Grab your secret key{" "}
            <a
              href="https://dashboard.stripe.com/test/apikeys"
              target="_blank"
              className="underline"
            >
              here
            </a>
          </p>
          {/* <ConnectStripeStep mutate={mutate} productData={data} /> */}
          <Input
            className="w-full"
            placeholder="Stripe secret key (sk_test_...)"
            value={org?.stripe_connected ? "Stripe connected  ✅ " : testApiKey}
            onChange={(e) => setTestApiKey(e.target.value)}
            disabled={org?.stripe_connected}
          />
        </CustomDialogBody>
        <CustomDialogFooter>
          <Button
            variant="add"
            onClick={handleConnectStripe}
            isLoading={loading}
          >
            Connect Stripe
          </Button>
        </CustomDialogFooter>
      </CustomDialogContent>
    </Dialog>
  );
}
