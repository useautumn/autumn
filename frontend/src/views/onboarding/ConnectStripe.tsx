"use client";

import FieldLabel from "@/components/general/modal-components/FieldLabel";
import React, { useState } from "react";
import toast from "react-hot-toast";

import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { AppEnv, Organization } from "@autumn/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { stripeCurrencyCodes } from "@/data/stripeCurrencyCodes";
import { ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@clerk/nextjs";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import SmallSpinner from "@/components/general/SmallSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCcStripe, faStripeS } from "@fortawesome/free-brands-svg-icons";

function ConnectStripe({
  className,
  onboarding,
}: {
  className?: string;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

  const [testApiKey, setTestApiKey] = useState("");
  const [liveApiKey, setLiveApiKey] = useState("");
  const [successUrl, setSuccessUrl] = useState("https://useautumn.com");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [isLoading, setIsLoading] = useState(false);

  const {
    data: orgData,
    mutate: mutateOrg,
    isLoading: isOrgLoading,
  } = useAxiosSWR({
    url: `/organization`,
    env: AppEnv.Live,
  });

  const org = orgData?.org;

  const handleConnectStripe = async () => {
    if (!testApiKey || !successUrl || !defaultCurrency) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!successUrl.startsWith("http") && !successUrl.startsWith("https")) {
      toast.error("Success URL must start with http or https");
      return;
    }

    setIsLoading(true);

    try {
      await OrgService.connectStripe(axiosInstance, {
        testApiKey,
        liveApiKey: onboarding ? testApiKey : liveApiKey,
        successUrl,
        defaultCurrency,
      });

      toast.success("Successfully connected to Stripe");
      await mutateOrg();
      if (redirect && !onboarding) {
        navigateTo(redirect, router, AppEnv.Live);
      }
    } catch (error) {
      console.log("Failed to connect Stripe", error);
      toast.error(getBackendErr(error, "Failed to connect Stripe"));
    }

    setIsLoading(false);
  };

  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const handleDisconnectStripe = async () => {
    try {
      setIsDisconnecting(true);
      await OrgService.disconnectStripe(axiosInstance);
      await mutateOrg();
      toast.success("Successfully disconnected from Stripe");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to disconnect Stripe"));
    }
    setIsDisconnecting(false);
  };

  if (isOrgLoading) {
    return <SmallSpinner />;
  }

  if (org?.stripe_connected) {
    return (
      <div
        className={cn(
          "flex flex-col gap-4",
          className,
          onboarding && "flex-row justify-between items-center"
        )}
      >
        <p className="text-t3 text-sm">Stripe Connected &nbsp; ✅</p>
        <Button
          onClick={handleDisconnectStripe}
          variant="gradientSecondary"
          className={`${onboarding ? "w-fit" : ""}`}
          isLoading={isDisconnecting}
        >
          Disconnect Stripe
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col font-regular gap-4", className)}>
      <CustomToaster />
      <div className="flex flex-col font-regular gap-4">
        <div>
          <FieldLabel>Stripe Test Secret API Key</FieldLabel>
          <Input
            value={testApiKey}
            placeholder="sk_test_..."
            onChange={(e) => setTestApiKey(e.target.value)}
          />
        </div>

        {!onboarding && (
          <div>
            <FieldLabel>Stripe Live Secret API Key</FieldLabel>
            <Input
              value={liveApiKey}
              placeholder="sk_live_..."
              onChange={(e) => setLiveApiKey(e.target.value)}
            />
          </div>
        )}
        <div className="flex gap-2 w-full">
          <div className="w-full truncate">
            <FieldLabel>Success URL after Stripe payment</FieldLabel>
            <Input
              value={successUrl}
              onChange={(e) => setSuccessUrl(e.target.value)}
            />
          </div>
          <div className="w-1/4 min-w-32">
            <FieldLabel>Currency</FieldLabel>
            <CurrencySelect
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            className="w-fit"
            variant="gradientPrimary"
            onClick={handleConnectStripe}
            disabled={org?.stripe_connected}
            isLoading={isLoading}
            startIcon={<FontAwesomeIcon icon={faStripeS} className="mr-2" />}
          >
            Connect Stripe
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConnectStripe;

const CurrencySelect = ({
  defaultCurrency,
  setDefaultCurrency,
}: {
  defaultCurrency: string;
  setDefaultCurrency: (currency: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild className="p-2">
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between transition-colors duration-100",
            open &&
              "border-[rgb(139,92,246)] shadow-[0_0_2px_1px_rgba(139,92,246,0.25)]"
          )}
        >
          {defaultCurrency ? defaultCurrency : "Select currency..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command className="p-0">
          <CommandInput placeholder="Search currency..." />
          <CommandEmpty>No currency found.</CommandEmpty>
          <CommandList className="p-0">
            <CommandGroup className="p-0">
              {stripeCurrencyCodes.map((currency) => (
                <CommandItem
                  key={currency.code}
                  value={currency.code}
                  onSelect={(value) => {
                    setDefaultCurrency(value);
                    setOpen(false);
                  }}
                  className="p-2 flex items-center justify-between"
                >
                  {currency.currency} - {currency.code}
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      defaultCurrency === currency.code
                        ? "opacity-100"
                        : "opacity-0"
                    }`}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
