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
  priceConfig,
  setPriceConfig,
  handleCreateEntitlement,
  handleUpdateEntitlement,
  handleDeleteEntitlement,
}: {
  isUpdate?: boolean;
  entitlement: EntitlementWithFeature | Entitlement | null;
  setEntitlement: (entitlement: EntitlementWithFeature | null) => void;
  setShowFeatureCreate: (show: boolean) => void;
  selectedFeature: Feature | null;
  setSelectedFeature: (feature: Feature | null) => void;
  priceConfig: any;
  setPriceConfig: (priceConfig: any) => void;
  handleCreateEntitlement?: () => void;
  handleUpdateEntitlement?: () => void;
  handleDeleteEntitlement?: () => void;
}) => {
  const { features, product, env } = useProductContext();
  const navigate = useNavigate();

  const [originalEntitlement, _] = useState<Entitlement | null>(
    entitlement || null
  );
  const [showPerEntity, setShowPerEntity] = useState(
    entitlement?.entity_feature_id ? true : false
  );

  const [showPrice, setShowPrice] = useState(
    priceConfig.usage_tiers[0].amount > 0 || priceConfig.usage_tiers.length > 1
  ); // for the add price button
  const [showCycle, setShowCycle] = useState(
    entitlement && entitlement?.interval == EntInterval.Lifetime ? false : true
  ); // for the add cycle button
  // const [priceConfig, setPriceConfig] = useState<any>(
  //   getDefaultPriceConfig(PriceType.Usage) // default price config
  // );

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
    if (originalEntitlement && Number(originalEntitlement.allowance) > 0) {
      setPriceConfig({
        ...priceConfig,
        usage_tiers: [
          {
            from: 0,
            to: originalEntitlement.allowance, // set the to value to the original entitlement allowance
            amount: 0,
          },
          ...priceConfig.usage_tiers.slice(1),
        ],
      });
    }
  }, []);

  useEffect(() => {
    //translate pricing usage tiers into entitlement allowance config when saving new feature
    console.log(selectedFeature?.name, "priceConfig:", priceConfig);
    console.log(
      selectedFeature?.name,
      "originalEntitlement:",
      originalEntitlement
    );
    console.log(selectedFeature?.name, "fields:", fields);

    let newAllowance: number | "unlimited";
    if (fields.allowance_type == AllowanceType.Unlimited) {
      newAllowance = "unlimited";
    } else if (priceConfig.usage_tiers[0].amount == 0) {
      newAllowance = Number(priceConfig.usage_tiers[0].to);
      if (isNaN(newAllowance)) {
        newAllowance = 0;
      }
    } else {
      newAllowance = 0;
    }

    if (selectedFeature) {
      const newEnt = CreateEntitlementSchema.parse({
        internal_feature_id: selectedFeature.internal_id,
        feature_id: selectedFeature.id,
        feature: selectedFeature,
        ...fields,
        interval:
          showPrice && showCycle
            ? priceConfig.interval
            : showCycle
            ? fields.interval
            : EntInterval.Lifetime,
        entity_feature_id:
          fields.entity_feature_id && showPerEntity
            ? fields.entity_feature_id
            : null,
        // allowance: fields.allowance ? Number(fields.allowance) : 0,
        allowance: newAllowance,
      });

      const originalEnt = originalEntitlement ? originalEntitlement : null;
      setEntitlement({
        ...originalEnt,
        ...newEnt,
        feature: selectedFeature,
      });
    } else {
      setEntitlement(null);
    }
  }, [
    selectedFeature,
    showCycle,
    showPrice,
    priceConfig,
    fields,
    originalEntitlement,
    showPerEntity,
    setEntitlement,
  ]);

  return (
    <div className="w-full flex overflow-hidden gap-4">
      <div className="flex flex-col gap-2 w-full">
        <Select
          value={selectedFeature?.internal_id}
          onValueChange={(value) => {
            setSelectedFeature(getFeature(value, features));
            setPriceConfig({
              ...priceConfig,
              internal_feature_id: value,
            });
          }}
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
          <div className="flex flex-col text-sm">
            <Tabs
              defaultValue="fixed"
              className=""
              value={fields.allowance_type}
              // onValueChange={(value) =>
              //   setFields({
              //     ...fields,
              //     allowance_type: value as AllowanceType,
              //   })
              // }
            >
              {/* <div className="flex justify-between items-center">
                <TabsList>
                  <TabsTrigger value="fixed">Fixed</TabsTrigger>
                  <TabsTrigger value="unlimited">Unlimited</TabsTrigger>
                </TabsList>
              </div> */}
              <TabsContent
                value={fields.allowance_type}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col ">
                  <FieldLabel className="flex items-center gap-2">
                    {showPrice ? "Pricing" : "Included Usage"}
                    <Tooltip delayDuration={400}>
                      <TooltipTrigger asChild>
                        <InfoIcon className="w-3 h-3 text-t3/50" />
                      </TooltipTrigger>
                      <TooltipContent sideOffset={5} side="top">
                        How much usage of this feature is included as part of
                        this plan
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
                    <div className="flex w-full h-fit gap-2">
                      <Input
                        placeholder="eg. 100"
                        className=""
                        disabled={
                          fields.allowance_type == AllowanceType.Unlimited
                        }
                        value={priceConfig.usage_tiers[0].to}
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
                                  { from: 0, to: "unlimited", amount: 0.0 },
                                ],
                              }),
                              setShowCycle(false));
                        }}
                      >
                        ♾️
                      </ToggleDisplayButton>
                    </div>
                  )}
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
                              An entity (eg, a user) within the customer to
                              assign this entitlement to
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
                    {(showCycle || showPrice) && (
                      <SelectCycle
                        showPrice={showPrice}
                        priceConfig={priceConfig}
                        setPriceConfig={setPriceConfig}
                        fields={fields}
                        setFields={setFields}
                        setShowCycle={setShowCycle}
                        showCycle={showCycle}
                        selectedFeature={selectedFeature}
                      />
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
      {selectedFeature && (
        <>
          <div className="border-l ml-4"></div>
          <div className="flex flex-col w-fit justify-between gap-16 animate-in slide-in-from-right-1/2 duration-300 fade-out">
            <div className="flex flex-col gap-2 w-32">
              <ToggleDisplayButton
                label="Add Price"
                show={showPrice}
                disabled={
                  fields.allowance_type == AllowanceType.Unlimited
                  // ||
                  // !selectedFeature
                }
                className="w-full justify-start"
                onClick={() => {
                  if (
                    priceConfig.usage_tiers.length == 1 // if there's only 1 usage tier and it has a Number "to" value, add another usage tier
                    //  && typeof priceConfig.usage_tiers[0].to === "number"
                  ) {
                    if (!showPrice) {
                      //function for adding price
                      setPriceConfig({
                        ...priceConfig,
                        usage_tiers: [
                          {
                            from: 0,
                            to: priceConfig.usage_tiers[0].to || -1,
                            amount: priceConfig.usage_tiers[0].amount || 0,
                          },
                          ...(Number(priceConfig.usage_tiers[0].to) > 0 // if the first usage tier has a Number "to" value, add another usage tier
                            ? [
                                {
                                  from: priceConfig.usage_tiers[0].to,
                                  to: -1,
                                  amount: 0,
                                },
                              ]
                            : []),
                        ],
                      });
                    } else {
                      //function for removing price
                      setPriceConfig({
                        ...priceConfig,
                        usage_tiers: [
                          {
                            from: 0,
                            to:
                              priceConfig.usage_tiers[0].to > 0
                                ? priceConfig.usage_tiers[0].to
                                : "",
                            amount: 0,
                          },
                        ],
                      });
                    }
                  }
                  setShowPrice(!showPrice);
                }}
              >
                {showPrice ? (
                  <MinusIcon size={14} className="mr-1" />
                ) : (
                  <PlusIcon size={14} className="mr-1" />
                )}
                {showPrice ? "Remove Price" : "Add Price"}
              </ToggleDisplayButton>
              <ToggleDisplayButton
                label="Add Cycle"
                show={showCycle}
                disabled={
                  fields.allowance_type == AllowanceType.Unlimited
                  // ||
                  // !selectedFeature
                }
                className="w-full justify-start"
                onClick={() => setShowCycle(!showCycle)}
              >
                {showCycle ? (
                  <MinusIcon size={14} className="mr-1" />
                ) : (
                  <PlusIcon size={14} className="mr-1" />
                )}
                Usage Reset
              </ToggleDisplayButton>
              <MoreMenuButton
                fields={fields}
                setFields={setFields}
                showPerEntity={showPerEntity}
                setShowPerEntity={setShowPerEntity}
                selectedFeature={selectedFeature}
              />
            </div>
            <div className="flex flex-col gap-2">
              {handleDeleteEntitlement && (
                <Button
                  variant="destructive"
                  // disabled={!selectedFeature}
                  className="w-full rounded-sm"
                  size="sm"
                  onClick={() => {
                    handleDeleteEntitlement();
                  }}
                >
                  Delete
                </Button>
              )}
              {handleUpdateEntitlement && (
                <Button
                  variant="gradientPrimary"
                  // disabled={!selectedFeature}
                  className="w-full"
                  onClick={() => {
                    handleUpdateEntitlement();
                  }}
                >
                  Update Feature
                </Button>
              )}
              {handleCreateEntitlement && (
                <Button
                  variant="gradientPrimary"
                  disabled={!selectedFeature}
                  className="w-full"
                  onClick={() => {
                    handleCreateEntitlement();
                  }}
                >
                  Add to Product
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
