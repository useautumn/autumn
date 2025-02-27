import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

import {
  AllowanceType,
  BillingInterval,
  BillWhen,
  EntitlementWithFeature,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";

import React, { useEffect, useState } from "react";
import { keyToTitleFirstCaps } from "@/utils/formatUtils/formatTextUtils";
import { Button } from "@/components/ui/button";
import { cn } from "@nextui-org/theme";
import { faXmark } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useProductContext } from "../ProductContext";
import { getFeature } from "@/utils/product/entitlementUtils";
import { getBillingUnits } from "@/utils/product/priceUtils";
import { Checkbox } from "@/components/ui/checkbox";

function CreateUsagePrice({
  config,
  setConfig,
  usageTiers,
  setUsageTiers,
  price,
  isUpdate = false,
}: {
  config: any;
  setConfig: (config: any) => void;
  usageTiers: any[];
  setUsageTiers: (usageTiers: any[]) => void;
  price: Price;
  isUpdate: boolean;
}) {
  const {
    features,
    product,
    selectedEntitlementAllowance,
    setSelectedEntitlementAllowance,
  } = useProductContext();

  useEffect(() => {
    // find the entitlement with the feature_id, and console log the entitlements allowance
    const entitlement = product.entitlements.find(
      (e) => e.feature_id == config.feature_id
    );
    if (entitlement?.allowance_type == AllowanceType.Unlimited) {
      setSelectedEntitlementAllowance("unlimited");
      return;
    }
    setSelectedEntitlementAllowance(entitlement?.allowance || 0);
  }, [config.feature_id]);

  const setUsageTier = (index: number, key: string, value: string) => {
    const newUsageTiers = [...config.usage_tiers];
    newUsageTiers[index] = { ...newUsageTiers[index], [key]: value };
    if (key === "to") {
      newUsageTiers[index + 1].from = value;
    }
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleAddTier = () => {
    const newUsageTiers = [...config.usage_tiers];
    // First, change the last tier to be 0
    const lastTier = newUsageTiers[newUsageTiers.length - 1];
    if (lastTier.to == -1) {
      newUsageTiers[newUsageTiers.length - 1].to = 0;
    }
    newUsageTiers.push({ from: 0, to: -1, amount: 0.0 });
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleRemoveTier = (index: number) => {
    const newUsageTiers = [...config.usage_tiers];
    newUsageTiers.splice(index, 1);
    newUsageTiers[newUsageTiers.length - 1].to = -1;
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const filteredEntitlements = product.entitlements.filter(
    (entitlement: EntitlementWithFeature) => {
      const config = price?.config as UsagePriceConfig;
      const feature = getFeature(entitlement.internal_feature_id, features);

      if (feature?.type === "boolean") {
        return false;
      }

      if (
        isUpdate &&
        config.internal_feature_id == entitlement.internal_feature_id
      ) {
        return true;
      }
      if (
        product.prices.some((price: Price) => {
          const config = price.config as UsagePriceConfig;
          return config.internal_feature_id == entitlement.internal_feature_id;
        })
      ) {
        return false;
      }
      return true;
    }
  );

  const getBillWhen = () => {
    if (config.bill_when == BillWhen.InAdvance) {
      return BillWhen.StartOfPeriod;
    }
    return config.bill_when;
  };

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Entitlement */}
      <div className="flex gap-2 w-full">
        <div className="w-full overflow-hidden">
          <FieldLabel>Entitlement</FieldLabel>
          <Select
            value={config.feature_id}
            onValueChange={(value) => {
              setConfig({
                ...config,
                feature_id: value as string,
                internal_feature_id: features.find((f) => f.id === value)
                  ?.internal_id,
              });
            }}
            disabled={isUpdate}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filteredEntitlements.length === 0 ? (
                <SelectItem value="none" disabled>
                  No metered entitlements
                </SelectItem>
              ) : (
                filteredEntitlements.map(
                  (entitlement: EntitlementWithFeature, index: number) => {
                    const feature = getFeature(
                      entitlement.internal_feature_id,
                      features
                    );
                    if (!feature) return null;
                    return (
                      <SelectItem key={index} value={feature.id!}>
                        {feature?.name}{" "}
                        <span className="text-t3">{feature?.id}</span>
                      </SelectItem>
                    );
                  }
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full">
          <FieldLabel>Bill When</FieldLabel>
          <Select
            value={!isUpdate ? config.bill_when : getBillWhen()}
            onValueChange={(value) =>
              setConfig({ ...config, bill_when: value as BillWhen })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BillWhen)
                .filter((item) => item != BillWhen.InAdvance)
                .map((item) => (
                  <SelectItem key={item} value={item}>
                    {keyToTitleFirstCaps(item)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Price */}
      <div className="flex gap-2 w-full">
        {[BillWhen.StartOfPeriod, BillWhen.EndOfPeriod].includes(
          getBillWhen()
        ) && (
          <div className="w-6/12">
            <FieldLabel>Interval</FieldLabel>
            <Select
              value={config.interval}
              onValueChange={(value) =>
                setConfig({ ...config, interval: value as BillingInterval })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Interval" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BillingInterval).map((item) => (
                  <SelectItem key={item} value={item}>
                    {keyToTitleFirstCaps(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {[BillWhen.StartOfPeriod, BillWhen.EndOfPeriod].includes(
          getBillWhen()
        ) && (
          <div className="w-6/12">
            <FieldLabel>Billing Units</FieldLabel>
            <Input
              type="number"
              value={config.billing_units}
              onChange={(e) =>
                setConfig({ ...config, billing_units: e.target.value })
              }
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-t3 text-sm mt-2 mb-2">Tiers</p>
        {selectedEntitlementAllowance === "unlimited" ? (
          <p className="rounded-sm px-2 py-1 bg-yellow-100 border border-yellow-500 text-yellow-500 text-xs mb-2">
            This entitlement has <span className="font-bold">unlimited</span>{" "}
            usage, so you can&apos;t apply pricing.
          </p>
        ) : (
          selectedEntitlementAllowance !== 0 && (
            <p className="rounded-sm px-2 py-1 bg-yellow-100 border border-yellow-500 text-yellow-500 text-xs mb-2">
              This entitlement has an allowance of{" "}
              <span className="font-bold">{selectedEntitlementAllowance}</span>.
              Overage pricing will be applied after the allowance is used.
            </p>
          )
        )}
        <div className="flex">
          <p className="w-4/12 text-t3 text-xs">From</p>
          <p className="w-4/12 text-t3 text-xs">To</p>
          <p className="w-4/12 text-t3 text-xs">Amount</p>
        </div>

        {config.usage_tiers.map((tier, index) => (
          <div key={index} className="flex gap-1 w-full items-center">
            <div className="w-full flex items-center">
              <div className="flex w-4/12 text-sm">
                <UsageTierInput
                  value={tier.from || 0}
                  onChange={(e) => setUsageTier(index, "from", e.target.value)}
                  type="from"
                  config={config}
                  entitlements={product.entitlements}
                />
              </div>
              <div
                className={cn(
                  "flex w-4/12 text-sm",
                  tier.to == -1 && "bg-transparent"
                )}
              >
                <UsageTierInput
                  value={tier.to}
                  onChange={(e) => {
                    setUsageTier(index, "to", e.target.value);
                  }}
                  type="to"
                  config={config}
                  entitlements={product.entitlements}
                />
              </div>
              <div className="flex w-4/12 text-sm items-center">
                <UsageTierInput
                  value={tier.amount}
                  onChange={(e) =>
                    setUsageTier(index, "amount", e.target.value)
                  }
                  type="amount"
                  config={config}
                  entitlements={product.entitlements}
                />
              </div>
            </div>
            {config.usage_tiers.length > 1 && (
              <Button
                isIcon
                size="sm"
                variant="ghost"
                className="w-fit text-t3"
                onClick={() => handleRemoveTier(index)}
                dim={6}
              >
                <FontAwesomeIcon icon={faXmark} />
              </Button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="w-fit mt-2"
          onClick={handleAddTier}
        >
          Add Tier
        </Button>
      </div>
    </div>
  );
}

export default CreateUsagePrice;

export const UsageTierInput = ({
  value,
  onChange,
  type,
  config,
  entitlements,
}: {
  value: number;
  onChange: (e: any) => void;
  type: "from" | "to" | "amount";
  config?: any;
  entitlements?: any[];
}) => {
  if ((type === "to" && value === -1) || type === "from") {
    return (
      <Input
        className="outline-none bg-transparent shadow-none flex-grow mr-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value === -1 ? "♾️" : value}
        disabled
        type="text"
      />
    );
  }

  // const getNumUnits = () => {
  //   if (config.bill_when == BillWhen.EndOfPeriod) {
  //     return `${config.billing_units} ` || "n";
  //   }

  //   const entitlement = entitlements?.find(
  //     (e) => e.internal_feature_id == config?.internal_feature_id
  //   );
  //   if (!entitlement) return "n";

  //   if (entitlement.allowance_type == AllowanceType.Unlimited) return "∞";
  //   if (entitlement.allowance_type == AllowanceType.None) return "n";

  //   return `${entitlement.allowance} `;
  // };

  return (
    <div className="relative flex-grow mr-1">
      <Input
        className={cn(
          "outline-none w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          type === "amount" && "pr-12"
        )}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
      />
      {type === "amount" && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]">
          / {getBillingUnits(config, entitlements!)}
          units
        </span>
      )}
    </div>
  );
};
