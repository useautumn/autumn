import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/useOrg";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import LoadingScreen from "@/views/general/LoadingScreen";
import { CurrencySelect } from "@/views/onboarding/ConnectStripe";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const ConfigureStripe = () => {
  const { org, isLoading, mutate } = useOrg();
  const axiosInstance = useAxiosInstance();

  const [newStripeConfig, setNewStripeConfig] = useState<any>({
    success_url: org?.success_url,
    default_currency: org?.default_currency,
    secret_key: org?.stripe_connected ? "Stripe connected" : "",
  });

  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setNewStripeConfig({
      success_url: org?.success_url,
      default_currency: org?.default_currency,
      stripe_connected: org?.stripe_connected,
    });
  }, [org]);

  const allowSave = () => {
    return (
      newStripeConfig.success_url !== org?.success_url ||
      newStripeConfig.default_currency !== org?.default_currency ||
      (!org?.stripe_connected && !!newStripeConfig.secret_key)
    );
  };

  const handleConnectStripe = async () => {
    if (!newStripeConfig.success_url) {
      toast.error("Success URL is required");
      return;
    }

    setConnecting(true);

    try {
      await OrgService.connectStripe(axiosInstance, newStripeConfig);
      await mutate();
      toast.success("Successfully connected to Stripe");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to connect Stripe"));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectStripe = async () => {
    setDisconnecting(true);
    try {
      await OrgService.disconnectStripe(axiosInstance);
      await mutate();
      toast.success("Successfully disconnected from Stripe");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to disconnect Stripe"));
    }
    setDisconnecting(false);
  };

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="flex flex-col gap-2">
      <PageSectionHeader title="Configure Stripe" />
      <div className="px-10 max-w-[400px] flex flex-col gap-4">
        <div>
          <FieldLabel>Return URL</FieldLabel>
          <Input
            value={newStripeConfig.success_url}
            onChange={(e) =>
              setNewStripeConfig({
                ...newStripeConfig,
                success_url: e.target.value,
              })
            }
            placeholder="eg. https://useautumn.com"
          />
        </div>

        <div>
          <FieldLabel>Default Currency</FieldLabel>
          {/* <Input value={org.default_currency} /> */}
          <CurrencySelect
            defaultCurrency={newStripeConfig.default_currency}
            setDefaultCurrency={(currency) =>
              setNewStripeConfig({
                ...newStripeConfig,
                default_currency: currency,
              })
            }
          />
        </div>
        <div>
          <FieldLabel>Stripe Secret Key</FieldLabel>
          {org.stripe_connected ? (
            <Input disabled value="Stripe connected" />
          ) : (
            <Input
              placeholder="sk_test_..."
              value={newStripeConfig.secret_key}
              onChange={(e) =>
                setNewStripeConfig({
                  ...newStripeConfig,
                  secret_key: e.target.value,
                })
              }
            />
          )}
        </div>
        <div className="flex gap-2">
          <Button
            className="w-6/12 mt-2"
            disabled={!allowSave()}
            onClick={handleConnectStripe}
            isLoading={connecting}
          >
            Save
          </Button>
          {org.stripe_connected && (
            <Button
              className="w-6/12 mt-2"
              variant="destructive"
              onClick={handleDisconnectStripe}
              isLoading={disconnecting}
            >
              Disconnect Stripe
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
