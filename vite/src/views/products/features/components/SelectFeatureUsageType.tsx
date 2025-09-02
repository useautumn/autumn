import {
  APIFeatureType,
  CreateFeature,
  FeatureType,
  FeatureUsageType,
} from "@autumn/shared";
import { Clock, Zap } from "lucide-react";
import { defaultMeteredConfig } from "../utils/defaultFeatureConfig";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectType } from "@/components/general/SelectType";

export const SelectFeatureUsageType = ({
  feature,
  setFeature,
}: {
  feature: CreateFeature;
  setFeature: any;
}) => {
  const featureType = feature.type;
  const usageType = feature.config?.usage_type;

  const setFeatureType = (type: APIFeatureType) => {
    // 1. If type is boolean
    if (type === APIFeatureType.Boolean) {
      setFeature({
        ...feature,
        type: APIFeatureType.Boolean,
        config: undefined,
      });
    } else {
      setFeature({
        ...feature,
        type: FeatureType.Metered,
        config: { ...defaultMeteredConfig, usage_type: type },
      });
    }
  };
  return (
    <div className="flex flex-col">
      <FieldLabel>Usage Type</FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        <SelectType
          title="Single"
          description="Features that are consumed and refilled like 'credits' or 'tokens'"
          icon={<Zap className="text-t3" size={12} />}
          isSelected={
            featureType === FeatureType.Metered &&
            usageType === FeatureUsageType.Single
          }
          onClick={() => setFeatureType(APIFeatureType.SingleUsage)}
        />
        <SelectType
          title="Continuous"
          description="Features used on an ongoing basis, like 'seats' or 'storage'"
          icon={<Clock className="text-t3" size={12} />}
          isSelected={
            featureType === FeatureType.Metered &&
            usageType === FeatureUsageType.Continuous
          }
          onClick={() => setFeatureType(APIFeatureType.ContinuousUse)}
        />
        {/* <SelectType
          title="Boolean"
          description="Features that are either enabled or disabled, like 'premium models'"
          icon={<ToggleLeft className="h-3 w-3 text-t3" />}
          isSelected={featureType === FeatureType.Boolean}
          onClick={() => setFeatureType(APIFeatureType.Boolean)}
        /> */}
      </div>
    </div>
  );
};
