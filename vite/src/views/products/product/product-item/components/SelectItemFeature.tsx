import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductItemContext } from "../ProductItemContext";
import { useProductContext } from "../../ProductContext";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import { Feature } from "@autumn/shared";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

export const SelectItemFeature = () => {
  const { features } = useProductContext();
  const { item, setItem, setShowCreateFeature, isUpdate } =
    useProductItemContext();

  return (
    <div className="flex items-center gap-2">
      <Select
        value={item.feature_id || ""}
        onValueChange={(value) => {
          setItem({ ...item, feature_id: value });
          // setSelectedFeature(getFeature(value, features));
          // setPriceConfig({
          //   ...priceConfig,
          //   internal_feature_id: value,
          // });
        }}
        disabled={isUpdate}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a feature" />
        </SelectTrigger>
        <SelectContent>
          {features.map((feature: Feature) => (
            <SelectItem key={feature.id} value={feature.id!}>
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
              setShowCreateFeature(true);
            }}
          >
            <PlusIcon className="w-3 h-3 mr-2" />
            Create new feature
          </Button>
        </SelectContent>
      </Select>
      {item.feature_id && !isUpdate && (
        <Button
          isIcon
          size="sm"
          variant="ghost"
          className="w-fit text-t3"
          onClick={() => setItem({ ...item, feature_id: null })}
        >
          <X size={12} className="text-t3" />
        </Button>
      )}
    </div>
  );
};
