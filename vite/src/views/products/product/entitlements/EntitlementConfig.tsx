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
  CreateEntitlementSchema,
  Entitlement,
  Feature,
  FeatureType,
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
import { EllipsisVertical, InfoIcon, PlusIcon } from "lucide-react";

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

export const EntitlementConfig = ({
  isUpdate = false,
  entitlement,
  setEntitlement,
}: {
  isUpdate?: boolean;
  entitlement: EntitlementWithFeature | Entitlement | null;
  setEntitlement: (entitlement: EntitlementWithFeature | null) => void;
}) => {
  const { features, product, env } = useProductContext();
  const navigate = useNavigate();

  const [originalEntitlement, _] = useState<Entitlement | null>(
    entitlement || null
  );
  const [showPerEntity, setShowPerEntity] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
    getFeature(entitlement?.internal_feature_id, features) || null
  );

  const [fields, setFields] = useState({
    carry_from_previous: entitlement?.carry_from_previous || false,
    allowance_type: entitlement?.allowance_type || AllowanceType.Fixed,
    allowance: entitlement?.allowance || "",
    interval: entitlement?.interval || EntInterval.Month,
  });

  useEffect(() => {
    if (selectedFeature) {
      const newEnt = CreateEntitlementSchema.parse({
        internal_feature_id: selectedFeature.internal_id,
        feature_id: selectedFeature.id,
        feature: selectedFeature,
        ...fields,
        allowance: fields.allowance ? Number(fields.allowance) : 0,
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
  }, [selectedFeature, fields, originalEntitlement, setEntitlement]);

  return (
    <div className="">
      <FieldLabel>Entitlement </FieldLabel>
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
                return true;
              }
              const existingEnt = product.entitlements.find(
                (ent: Entitlement) =>
                  ent.internal_feature_id === feature.internal_id
              );
              return !existingEnt;
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
            onClick={() => {
              window.location.href =
                env === AppEnv.Sandbox ? "/sandbox/features" : "/features";
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
            <div className="flex justify-between items-center">
              <TabsList>
                <TabsTrigger value="fixed">Fixed</TabsTrigger>
                <TabsTrigger value="unlimited">Unlimited</TabsTrigger>
              </TabsList>
              <div className="flex gap-1">
                <Popover open={showPopover} onOpenChange={setShowPopover}>
                  <PopoverTrigger asChild>
                    <Button
                      className="h-7 p-2 border rounded-none text-t3 text-xs"
                      variant="outline"
                    >
                      <EllipsisVertical size={12} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-48 p-2 flex flex-col text-xs"
                    align="end"
                  >
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="secondary"
                        className="text-xs text-t3 shadow-none border-none"
                        onClick={() => {
                          setFields({
                            ...fields,
                            carry_from_previous: !fields.carry_from_previous,
                          });
                        }}
                      >
                        <Checkbox
                          className="border-t3 mr-1"
                          checked={fields.carry_from_previous}
                          onCheckedChange={(checked) =>
                            setFields({
                              ...fields,
                              carry_from_previous: Boolean(checked),
                            })
                          }
                        />
                        Keep usage on upgrade
                      </Button>
                    </div>
                    <Button
                      className="h-7 shadow-none text-t3 text-xs justify-start border-none"
                      variant="outline"
                      startIcon={<PlusIcon size={14} className="ml-0.5 mr-1" />}
                      onClick={() => {
                        setShowPerEntity(!showPerEntity);
                        // hide the popover
                        setShowPopover(false);
                      }}
                    >
                      {showPerEntity ? "Remove Entity" : "Per Entity"}
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <TabsContent value="fixed">
              <div className="flex gap-2 items-center">
                <div className="flex flex-col">
                  <FieldLabel className="flex items-center gap-2">
                    Allowance
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
                  <Input
                    placeholder="eg. 100"
                    className="w-30"
                    value={fields.allowance}
                    type="number"
                    onChange={(e) =>
                      setFields({
                        ...fields,
                        allowance: e.target.value,
                      })
                    }
                  />
                </div>
                {showPerEntity && (
                  <div className="flex flex-col w-full">
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select feature" />
                      </SelectTrigger>
                      <SelectContent>
                        {features
                          .filter((feature: Feature) => {
                            // Filter out boolean features and the currently selected feature
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
                              value={feature.internal_id!}
                            >
                              <div className="flex gap-2 items-center">
                                {feature.name}
                                <FeatureTypeBadge type={feature.type} />
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col w-full">
                  <FieldLabel className="flex items-center gap-2">
                    Reset
                    <Tooltip delayDuration={400}>
                      <TooltipTrigger asChild>
                        <InfoIcon className="w-3 h-3 text-t3/50" />
                      </TooltipTrigger>
                      <TooltipContent sideOffset={5} side="top">
                        Frequency at which this entitlement should be reset back
                        to the allowance value
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Select
                    value={fields.interval}
                    onValueChange={(value) =>
                      setFields({
                        ...fields,
                        interval: value as EntInterval,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(EntInterval).map((interval) => (
                        <SelectItem key={interval} value={interval}>
                          {interval === "semi_annual"
                            ? "per half year"
                            : interval === "lifetime"
                            ? "never"
                            : `per ${interval}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
