import FieldLabel from "@/components/general/modal-components/FieldLabel";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AppEnv,
  BillingInterval,
  CreateEntitlementSchema,
  CreateProductItem,
  Entitlement,
  Feature,
  FeatureType,
  PriceType,
  ProductItemInterval,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProductContext } from "@/views/products/product/ProductContext";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import {
  AllowanceType,
  EntInterval,
  EntitlementWithFeature,
} from "@autumn/shared";
import { getFeature } from "@/utils/product/entitlementUtils";
import { Button } from "@/components/ui/button";
import {
  EllipsisVertical,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  X,
} from "lucide-react";

import { useNavigate } from "react-router";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CreateFeature } from "@/views/features/CreateFeature";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import CreateUsagePrice from "../prices/CreateUsagePrice";

import { getDefaultPriceConfig } from "@/utils/product/priceUtils";

import { PricingConfig } from "../prices/PricingConfig";
import { cn } from "@/lib/utils";
import TieredPrice from "./TieredPrice";
import { SelectCycle, UsageResetTooltip } from "./SelectCycle";
import { useProductItemContext } from "./ProductItemContext";
import { SelectItemFeature } from "./components/SelectItemFeature";
import { notNullish } from "@/utils/genUtils";

export const ProductItemConfig = ({}: {}) => {
  // HOOKS
  const { features, product, env } = useProductContext();
  const navigate = useNavigate();

  const { item, setItem, showCreateFeature, setShowCreateFeature, isUpdate } =
    useProductItemContext();

  const [showPerEntity, setShowPerEntity] = useState(
    notNullish(item.entity_feature_id)
  );

  const [showCycle, setShowCycle] = useState(
    item.interval !== ProductItemInterval.None
  );

  const [showPrice, setShowPrice] = useState(
    notNullish(item.amount) || notNullish(item.tiers)
  );

  // const [originalEntitlement, _] = useState<Entitlement | null>(
  //   entitlement || null
  // );
  // const [showPerEntity, setShowPerEntity] = useState(
  //   entitlement?.entity_feature_id ? true : false
  // );

  // const [showPrice, setShowPrice] = useState(
  //   priceConfig.usage_tiers?.[0].amount > 0 ||
  //     priceConfig.usage_tiers?.length > 1 ||
  //     priceConfig.usage_tiers?.[0].to == -1 || // to prevent for a weird state with 0 price
  //     priceConfig.type == PriceType.Fixed ||
  //     buttonType == "price"
  // ); // for the add price button

  // const [showCycle, setShowCycle] = useState(
  //   entitlement && entitlement?.interval == EntInterval.Lifetime ? false : true
  // );
  // const [showFeature, setShowFeature] = useState(
  //   priceConfig.type == PriceType.Fixed || buttonType == "price" ? false : true
  // );

  // const [fields, setFields] = useState({
  //   carry_from_previous: entitlement?.carry_from_previous || false,
  //   allowance_type: entitlement?.allowance_type || AllowanceType.Fixed,
  //   allowance: entitlement?.allowance || "",
  //   interval: entitlement?.interval || EntInterval.Month,
  //   entity_feature_id: entitlement?.entity_feature_id || "",
  // });

  // useEffect(() => {
  //   //translate pricing usage tiers into entitlement allowance config when saving new feature
  //   console.log(selectedFeature?.name, "priceConfig:", priceConfig);

  //   let newAllowance: number | "unlimited";
  //   if (fields.allowance_type == AllowanceType.Unlimited) {
  //     newAllowance = "unlimited";
  //   } else if (
  //     priceConfig.usage_tiers?.[0].amount == 0 &&
  //     priceConfig.usage_tiers?.[0].to > 0 // to prevent for a weird bug with 0 price
  //   ) {
  //     newAllowance = Number(priceConfig.usage_tiers?.[0].to);
  //     if (isNaN(newAllowance)) {
  //       newAllowance = 0;
  //     }
  //   } else {
  //     newAllowance = 0;
  //   }

  //   let newEntInterval;
  //   if (showPrice && showCycle) {
  //     newEntInterval =
  //       priceConfig.interval == BillingInterval.OneOff
  //         ? EntInterval.Lifetime
  //         : fields.interval;
  //   } else if (showCycle) {
  //     newEntInterval = fields.interval;
  //   } else {
  //     newEntInterval = EntInterval.Lifetime;
  //   }

  //   if (selectedFeature) {
  //     const newEnt = CreateEntitlementSchema.parse({
  //       internal_feature_id: selectedFeature.internal_id,
  //       feature_id: selectedFeature.id,
  //       feature: selectedFeature,
  //       ...fields,
  //       interval: newEntInterval,
  //       entity_feature_id:
  //         fields.entity_feature_id && showPerEntity
  //           ? fields.entity_feature_id
  //           : null,
  //       // allowance: fields.allowance ? Number(fields.allowance) : 0,
  //       allowance: newAllowance,
  //     });

  //     const originalEnt = originalEntitlement ? originalEntitlement : null;
  //     setEntitlement({
  //       ...originalEnt,
  //       ...newEnt,
  //       feature: selectedFeature,
  //     } as EntitlementWithFeature);
  //   } else {
  //     setEntitlement(null);
  //   }
  // }, [
  //   selectedFeature,
  //   showCycle,
  //   showPrice,
  //   priceConfig,
  //   fields,
  //   originalEntitlement,
  //   showPerEntity,
  //   setEntitlement,
  // ]);

  return (
    <div
      className={cn(
        "flex overflow-hidden w-lg transition-all ease-in-out duration-300" //modal animations
        // !showFeature && !showPrice && "w-xs",
        // !showFeature && showPrice && "w-sm",
        // priceConfig.usage_tiers?.length > 1 && "w-2xl"
      )}
    >
      <div className="flex flex-col gap-4 w-full overflow-hidden">
        {/* 1. Select or create feature */}
        <SelectItemFeature />

        {/* If selected feature is not a boolean */}
        <div className="flex flex-col text-sm">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col">
                <FieldLabel className="flex items-center gap-2">
                  {/* {showPrice ? "Pricing" : "Included Usage"} */}
                  <Tooltip delayDuration={400}>
                    <TooltipTrigger asChild>
                      <InfoIcon className="w-3 h-3 text-t3/50" />
                    </TooltipTrigger>
                    <TooltipContent sideOffset={5} side="top">
                      How much usage of this feature is included as part of this
                      plan
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                {/* {showPrice ? (
                  <TieredPrice
                    selectedFeature={selectedFeature && selectedFeature}
                    config={priceConfig}
                    setShowPrice={setShowPrice}
                    setConfig={setPriceConfig}
                  />
                ) : (
                  <div className="flex w-full h-fit gap-2">
                    <Input
                      placeholder="eg. 100"
                      className=""
                      disabled={
                        fields.allowance_type == AllowanceType.Unlimited
                      }
                      value={priceConfig.usage_tiers?.[0]?.to ?? ""}
                      type={
                        fields.allowance_type === AllowanceType.Unlimited
                          ? "text"
                          : "number"
                      }
                      onChange={(e) => {
                        if (Number(e.target.value)) {
                          setPriceConfig({
                            ...priceConfig,
                            usage_tiers: [
                              {
                                from: 0,
                                to: Number(e.target.value),
                                amount: 0,
                              },
                            ],
                          });
                        } else {
                          setPriceConfig({
                            ...priceConfig,
                            usage_tiers: [
                              {
                                from: 0,
                                to: e.target.value,
                                amount: 0,
                              },
                            ],
                          });
                        }
                      }}
                    />
                    <ToggleDisplayButton
                      label="Unlimited"
                      show={fields.allowance_type == AllowanceType.Unlimited}
                      className="h-8"
                      onClick={() => {
                        fields.allowance_type == AllowanceType.Unlimited
                          ? (setFields({
                              ...fields,
                              allowance_type: AllowanceType.Fixed,
                            }),
                            setPriceConfig({
                              ...priceConfig,
                              usage_tiers: [{ from: 0, to: "", amount: 0.0 }],
                            }))
                          : (setFields({
                              ...fields,
                              allowance_type: AllowanceType.Unlimited,
                            }),
                            setPriceConfig({
                              ...priceConfig,
                              usage_tiers: [
                                {
                                  from: 0,
                                  to: "unlimited",
                                  amount: 0.0,
                                },
                              ],
                            }),
                            setShowCycle(false));
                      }}
                    >
                      ♾️
                    </ToggleDisplayButton>
                  </div>
                )} */}
              </div>
              {(showPerEntity || showCycle || showPrice) && (
                <div className="flex gap-2 transition-all duration-200 ease-in-out animate-in fade-in fade-out">
                  {showPerEntity && (
                    <div className="flex flex-col w-full overflow-hidden">
                      <FieldLabel className="flex items-center gap-2">
                        Entity
                        <Tooltip delayDuration={400}>
                          <TooltipTrigger asChild>
                            <InfoIcon className="w-3 h-3 text-t3/50" />
                          </TooltipTrigger>
                          <TooltipContent sideOffset={5} side="top">
                            An entity (eg, a user) within the customer to assign
                            this entitlement to
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <Select
                        value={item.entity_feature_id}
                        onValueChange={(value) =>
                          setItem({
                            ...item,
                            entity_feature_id: value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select feature" />
                        </SelectTrigger>
                        <SelectContent>
                          {features
                            .filter(
                              (feature: Feature) =>
                                item.feature_id !== feature.id &&
                                feature.type !== FeatureType.Boolean
                            )
                            .map((feature: Feature) => (
                              <SelectItem
                                key={feature.internal_id}
                                value={feature.id}
                              >
                                <div className="flex gap-2 items-center">
                                  per {feature.name}
                                  <span className="font-mono text-t3">
                                    {feature.id}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* {(showCycle || showPrice) && (
                    <SelectCycle
                      showPrice={showPrice}
                      priceConfig={priceConfig}
                      setPriceConfig={setPriceConfig}
                      fields={fields}
                      setFields={setFields}
                      setShowCycle={setShowCycle}
                      showCycle={showCycle}
                    />
                  )} */}
                </div>
              )}
            </div>
            {/* {selectedFeature && (
              <UsageResetTooltip
                showCycle={showCycle}
                selectedFeature={selectedFeature}
                showPrice={showPrice}
                priceConfig={priceConfig}
                fields={fields}
              />
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
};
