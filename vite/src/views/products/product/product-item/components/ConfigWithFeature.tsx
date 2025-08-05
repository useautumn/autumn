import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectItemFeature } from "./SelectItemFeature";
import { useProductItemContext } from "../ProductItemContext";
import { useProductContext } from "../../ProductContext";
import { FeatureType } from "@autumn/shared";
import { getFeature } from "@/utils/product/entitlementUtils";
import { FeatureConfig } from "../product-item-config/FeatureItemConfig";
import { useEffect } from "react";
import { CreateItemStep } from "../utils/CreateItemStep";

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
  const { item } = useProductItemContext();

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
