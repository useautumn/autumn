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

function ConnectStripe({ org }: { org: Organization }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const axiosInstance = useAxiosInstance({ env: AppEnv.Live });

  const [testApiKey, setTestApiKey] = useState("");
  const [liveApiKey, setLiveApiKey] = useState("");
  const [successUrl, setSuccessUrl] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // const { getToken } = useAuth();
  const { session } = useSession();

  const handleConnectStripe = async () => {
    if (!testApiKey || !liveApiKey || !successUrl || !defaultCurrency) {
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
        liveApiKey,
        successUrl,
        defaultCurrency,
      });

      toast.success("Successfully connected to Stripe");

      if (redirect) {
        navigateTo(redirect, router, AppEnv.Live);
      } else {
        router.push("/");
      }
    } catch (error) {
      console.log("Failed to connect Stripe", error);
      toast.error(getBackendErr(error, "Failed to connect Stripe"));
    }

    setIsLoading(false);
  };

  if (org.stripe_connected) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-md font-medium text-t3">
          Stripe already connected 🎉🎉🎉
        </p>
      </div>
    );
  }

  return (
    <>
      <CustomToaster />
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="w-[430px] shadow-lg rounded-2xl border flex flex-col p-8 bg-white">
          <p className="text-md font-bold text-t2">
            Please connect your Stripe account
          </p>
          <p className="text-t3 text-xs mt-1">
            Your credentials will be encrypted and stored safely
          </p>
          <div className="flex flex-col font-regular mt-4 gap-4">
            <div>
              <FieldLabel>Test API Key</FieldLabel>
              <Input
                value={testApiKey}
                onChange={(e) => setTestApiKey(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Live API Key</FieldLabel>
              <Input
                value={liveApiKey}
                onChange={(e) => setLiveApiKey(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Success URL</FieldLabel>
              <Input
                value={successUrl}
                onChange={(e) => setSuccessUrl(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Default Currency</FieldLabel>
              <CurrencySelect
                defaultCurrency={defaultCurrency}
                setDefaultCurrency={setDefaultCurrency}
              />
              {/* <Select
                value={defaultCurrency}
                onValueChange={(value) => setDefaultCurrency(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stripeCurrencyCodes.map((currency) => (
                    <SelectItem
                      key={currency.code}
                      value={currency.code}
                      onClick={() => setDefaultCurrency(currency.code)}
                    >
                      {currency.currency} - {currency.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select> */}
            </div>

            <div className="flex justify-end mt-4">
              <Button
                className="w-fit"
                onClick={handleConnectStripe}
                isLoading={isLoading}
              >
                Connect Stripe
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
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
