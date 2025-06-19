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

export const SelectItemFeature = ({
  show,
  setShow,
}: {
  show: any;
  setShow: any;
}) => {
  const { features } = useProductContext();
  const { item, setItem, setShowCreateFeature, isUpdate } =
    useProductItemContext();

  return (
    <div className="flex items-center gap-2 w-full">
      <Select
        value={item.feature_id || ""}
        onValueChange={(value) => {
          setItem({ ...item, feature_id: value });
        }}
        disabled={isUpdate}
      >
        <SelectTrigger className="overflow-hidden">
          <SelectValue placeholder="Select a feature" />
        </SelectTrigger>
        <SelectContent>
          {features.map((feature: Feature) => (
            <SelectItem key={feature.id} value={feature.id!}>
              <div className="flex gap-2 items-center max-w-sm">
                <span className="truncate">{feature.name}</span>
                <FeatureTypeBadge type={feature.type} />
              </div>
            </SelectItem>
          ))}
          <Button
            className="flex w-full font-medium bg-background shadow-none text-primary hover:bg-primary/5"
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
      {!isUpdate && (
        <Button
          isIcon
          size="sm"
          variant="ghost"
          className="w-fit text-t3"
          onClick={() => {
            setItem({
              ...item,
              feature_id: null,
              included_usage: null,
              feature_type: null,
              tiers: null,
              price: item.tiers?.[0]?.amount || 0,
            });
            setShow({ ...show, feature: false });
          }}
        >
          <X size={12} className="text-t3" />
        </Button>
      )}
    </div>
  );
};
