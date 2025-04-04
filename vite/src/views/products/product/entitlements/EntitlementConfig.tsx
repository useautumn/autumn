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
  Entitlement,
  Feature,
  FeatureType,
  PriceType,
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
import { EllipsisVertical, InfoIcon, MinusIcon, PlusIcon } from "lucide-react";

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
import TieredPrice from "./TieredPrice";
import { getDefaultPriceConfig } from "@/utils/product/priceUtils";
import MoreMenuButton from "./MoreMenuButton";
import { SelectCycle } from "./SelectCycle";

export const EntitlementConfig = ({
  isUpdate = false,
  entitlement,
  setEntitlement,
  setShowFeatureCreate,
  selectedFeature,
  setSelectedFeature,
}: {
  isUpdate?: boolean;
  entitlement: EntitlementWithFeature | Entitlement | null;
  setEntitlement: (entitlement: EntitlementWithFeature | null) => void;
  setShowFeatureCreate: (show: boolean) => void;
  selectedFeature: Feature | null;
  setSelectedFeature: (feature: Feature | null) => void;
}) => {
  const { features, product, env } = useProductContext();
  const navigate = useNavigate();

  const [originalEntitlement, _] = useState<Entitlement | null>(
    entitlement || null
  );
  const [showPerEntity, setShowPerEntity] = useState(
    entitlement?.entity_feature_id ? true : false
  );
  const [showPrice, setShowPrice] = useState(false); // for the add price button
  const [showCycle, setShowCycle] = useState(false); // for the add cycle button
  const [priceConfig, setPriceConfig] = useState<any>(
    getDefaultPriceConfig(PriceType.Usage) // default price config
  );

  // const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
  //   getFeature(entitlement?.internal_feature_id, features) || null
  // );

  const [fields, setFields] = useState({
    carry_from_previous: entitlement?.carry_from_previous || false,
    allowance_type: entitlement?.allowance_type || AllowanceType.Fixed,
    allowance: entitlement?.allowance || "",
    interval: entitlement?.interval || EntInterval.Month,
    entity_feature_id: entitlement?.entity_feature_id || "",
  });

  useEffect(() => {
    if (selectedFeature) {
      const newEnt = CreateEntitlementSchema.parse({
        internal_feature_id: selectedFeature.internal_id,
        feature_id: selectedFeature.id,
        feature: selectedFeature,
        ...fields,
        entity_feature_id:
          fields.entity_feature_id && showPerEntity
            ? fields.entity_feature_id
            : null,
        allowance: fields.allowance ? Number(fields.allowance) : 0,
      });

      const originalEnt = originalEntitlement ? originalEntitlement : null;
      setEntitlement({
        ...originalEnt,
        ...newEnt,
        feature: selectedFeature,
      });
    } else {
      console.log("setting entitlement to null");
      setEntitlement(null);
    }
  }, [
    selectedFeature,
    priceConfig,
    fields,
    originalEntitlement,
    setEntitlement,
    showPerEntity,
  ]);

  return (
    <div className="w-full overflow-hidden">
      <Select
        value={selectedFeature?.internal_id}
        onValueChange={(value) =>
          setSelectedFeature(getFeature(value, features))
        }
        disabled={isUpdate}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a feature" />
        </SelectTrigger>
        <SelectContent>
          {features
            .filter((feature: Feature) => {
              if (selectedFeature?.internal_id == feature.internal_id) {
                return true; // show the selected feature in the dropdown
              }
              const existingEnt = product.entitlements.find(
                (ent: Entitlement) =>
                  ent.internal_feature_id === feature.internal_id
              );
              return !existingEnt; // show features that are not already in the product
            })
            .map((feature: Feature) => (
              <SelectItem
                key={feature.internal_id}
                value={feature.internal_id!}
              >
                <div className="flex gap-2 items-center">
                  {feature.name}
                  <FeatureTypeBadge type={feature.type} />
                </div>
              </SelectItem>
            ))}
          <Button
            className="flex w-full text-xs font-medium bg-white shadow-none text-primary hover:bg-stone-200"
            onClick={(e) => {
              e.preventDefault();
              setShowFeatureCreate(true);
            }}
          >
            <PlusIcon className="w-3 h-3 mr-2" />
            Create new feature
          </Button>
        </SelectContent>
      </Select>

      {selectedFeature && selectedFeature?.type != FeatureType.Boolean && (
        <div className="flex flex-col mt-4 text-sm">
          <Tabs
            defaultValue="fixed"
            className=""
            value={fields.allowance_type}
            onValueChange={(value) =>
              setFields({
                ...fields,
                allowance_type: value as AllowanceType,
              })
            }
          >
            {/* <div className="flex justify-between items-center">
              <TabsList>
                <TabsTrigger value="fixed">Fixed</TabsTrigger>
                <TabsTrigger value="unlimited">Unlimited</TabsTrigger>
              </TabsList>
            </div> */}
            <TabsContent value="fixed" className="flex flex-col gap-4">
              <div className="flex flex-col ">
                <FieldLabel className="flex items-center gap-2">
                  {showPrice ? "Pricing" : "Included Usage"}
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
                {showPrice ? (
                  <TieredPrice
                    selectedFeature={selectedFeature}
                    config={priceConfig}
                    setShowPrice={setShowPrice}
                    setConfig={setPriceConfig}
                  />
                ) : (
                  <Input
                    placeholder="eg. 100"
                    className=""
                    value={
                      priceConfig.usage_tiers[0].to > 0
                        ? priceConfig.usage_tiers[0].to
                        : ""
                    }
                    type="number"
                    onChange={(e) => {
                      if (Number(e.target.value) > 0) {
                        setPriceConfig({
                          ...priceConfig,
                          usage_tiers: [
                            {
                              from: 0,
                              to: e.target.value,
                              amount: 0.0,
                            },
                            {
                              from: e.target.value,
                              to: -1,
                              amount: 0.0,
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
                              amount: 0.0,
                            },
                          ],
                        });
                      }
                    }}
                  />
                )}
              </div>
              {(showPerEntity || showCycle) && (
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
                        value={fields.entity_feature_id}
                        onValueChange={(value) =>
                          setFields({ ...fields, entity_feature_id: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select feature" />
                        </SelectTrigger>
                        <SelectContent>
                          {features
                            .filter((feature: Feature) => {
                              if (feature.type === FeatureType.Boolean) {
                                return false;
                              }
                              if (
                                selectedFeature?.internal_id ===
                                feature.internal_id
                              ) {
                                return false;
                              }
                              return true;
                            })
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
                  {showCycle && (
                    <div className="flex flex-col w-full">
                      <FieldLabel className="flex items-center gap-2">
                        {showPrice ? "Billing Cycle" : "Reset Cycle"}
                        <Tooltip delayDuration={400}>
                          <TooltipTrigger asChild>
                            <InfoIcon className="w-3 h-3 text-t3/50" />
                          </TooltipTrigger>
                          <TooltipContent sideOffset={5} side="top">
                            Frequency at which this feature is reset
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <SelectCycle
                        showPrice={showPrice}
                        priceConfig={priceConfig}
                        setPriceConfig={setPriceConfig}
                        fields={fields}
                        setFields={setFields}
                        setShowCycle={setShowCycle}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 w-full justify-end">
                <ToggleDisplayButton
                  label="Add Cycle"
                  show={showCycle}
                  onClick={() => setShowCycle(!showCycle)}
                >
                  {showCycle ? (
                    <MinusIcon size={14} className="mr-1" />
                  ) : (
                    <PlusIcon size={14} className="mr-1" />
                  )}
                  {showCycle ? "Remove Cycle" : "Add Cycle"}
                </ToggleDisplayButton>
                <ToggleDisplayButton
                  label="Add Price"
                  show={showPrice}
                  onClick={() => {
                    setShowPrice(!showPrice);
                    !showCycle && !showPrice && setShowCycle(true);
                  }}
                >
                  {showPrice ? (
                    <MinusIcon size={14} className="mr-1" />
                  ) : (
                    <PlusIcon size={14} className="mr-1" />
                  )}
                  {showPrice ? "Remove Price" : "Add Price"}
                </ToggleDisplayButton>
                <MoreMenuButton
                  fields={fields}
                  setFields={setFields}
                  showPerEntity={showPerEntity}
                  setShowPerEntity={setShowPerEntity}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* {selectedFeature &&
        selectedFeature?.type != FeatureType.Boolean &&
        fields.allowance_type == AllowanceType.Fixed && (
          <div className="flex items-center gap-4 text-sm"></div>
        )} */}
    </div>
  );
};
