import { SelectItem } from "@/components/ui/select";

import { SelectContent } from "@/components/ui/select";
import { useProductItemContext } from "../ProductItemContext";
import { useProductContext } from "../../ProductContext";

import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon } from "lucide-react";
import {
  Feature,
  FeatureType,
  FeatureUsageType,
  ProductItemFeatureType,
} from "@autumn/shared";

export default function PerEntityConfig() {
  let { features } = useProductContext();
  let { item, setItem } = useProductItemContext();

  return (
    <div className="flex flex-col w-full overflow-hidden">
      <FieldLabel className="flex items-center gap-2">
        Entity
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <InfoIcon className="w-3 h-3 text-t3/50" />
          </TooltipTrigger>
          <TooltipContent sideOffset={5} side="top">
            An entity (eg, a user) within the customer to assign this
            entitlement to
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
            .filter((feature: Feature) => {
              if (feature.type === FeatureType.Boolean) {
                return false;
              }
              if (item.feature_id?.internal_id === feature.id) {
                return false;
              }

              if (feature.config?.usage_type == FeatureUsageType.Single) {
                return false;
              }
              return true;
            })
            .map((feature: Feature) => (
              <SelectItem key={feature.internal_id} value={feature.id}>
                <div className="flex gap-2 items-center">
                  per {feature.name}
                  <span className="font-mono text-t3">{feature.id}</span>
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
