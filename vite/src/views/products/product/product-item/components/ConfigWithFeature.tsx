import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectItemFeature } from "./SelectItemFeature";
import { useProductItemContext } from "../ProductItemContext";
import { useProductContext } from "../../ProductContext";
import { FeatureType } from "@autumn/shared";
import { getFeature } from "@/utils/product/entitlementUtils";
import { FeatureConfig } from "../product-item-config/FeatureItemConfig";

export const ConfigWithFeature = ({
  show,
  setShow,
  handleAddPrice,
}: {
  show: any;
  setShow: (show: any) => void;
  handleAddPrice: () => void;
}) => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();

  const isBooleanFeature =
    getFeature(item.feature_id, features)?.type === FeatureType.Boolean;

  return (
    <div className="flex flex-col gap-4 text-sm w-full">
      <div>
        <FieldLabel>Feature</FieldLabel>
        <SelectItemFeature show={show} setShow={setShow} />
      </div>

      {!isBooleanFeature && <FeatureConfig />}
    </div>
  );
};
