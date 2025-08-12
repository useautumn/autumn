import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectType } from "@/components/general/SelectType";
import { CircleGauge, Cog } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import {
  defaultPaidFeatureItem,
  defaultPriceItem,
} from "../create-product-item/defaultItemConfigs";
import { ConfigWithFeature } from "../components/ConfigWithFeature";
import CreateFixedPrice from "../../prices/CreateFixedPrice";
import { UsageModel } from "@autumn/shared";
import { nullish } from "@/utils/genUtils";

export const PriceItemConfig = () => {
  const { item, setItem, isUpdate } = useProductItemContext();

  // useEffect(() => {
  //   console.log("Item:", item);
  // }, [item]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="w-full">
        {/* <FieldLabel>Price Type</FieldLabel> */}
        <div className="grid grid-cols-2 gap-2 w-full text-t2">
          <SelectType
            title="Fixed"
            description="Fixed price to charge for this product (eg $10 per month)"
            icon={<Cog size={14} />}
            isSelected={item.isVariable === false}
            onClick={() => {
              if (item.isVariable !== false) {
                setItem({
                  ...defaultPriceItem,
                  tiers: null,
                  isVariable: false,
                });
              }
            }}
            disabled={item.isVariable === true && isUpdate}
          />
          <SelectType
            title="Variable"
            description="Price per use or purchased quantity (eg $1 per credit)"
            icon={<CircleGauge size={13} />}
            isSelected={item.isVariable}
            onClick={() => {
              if (!item.isVariable) {
                setItem({ ...defaultPaidFeatureItem, isVariable: true });
              }
            }}
            disabled={item.isVariable === false && isUpdate}
          />
        </div>
      </div>
      {item.isVariable === true && (
        <>
          {/* {item.usage_model !== null && } */}
          <ConfigWithFeature />
          {item.feature_id && <SelectUsageModel />}
        </>
      )}
      {item.isVariable === false && <CreateFixedPrice />}
    </div>
  );
};

const SelectUsageModel = () => {
  const { item, setItem } = useProductItemContext();

  return (
    <div className="w-full">
      <FieldLabel>Usage Model</FieldLabel>
      <div className="grid grid-cols-2 gap-2 w-full">
        <SelectType
          title="Pay Per Use"
          description="Charge based on number of units used of this feature"
          icon={<CircleGauge size={13} />}
          isSelected={item.usage_model === UsageModel.PayPerUse}
          onClick={() => {
            if (item.usage_model !== UsageModel.PayPerUse) {
              setItem({ ...item, usage_model: UsageModel.PayPerUse });
            }
          }}
          disabled={nullish(item.interval)}
        />
        <SelectType
          title="Upfront Quantity"
          description="Specify a quantity of this feature during checkout"
          icon={<Cog size={14} />}
          isSelected={item.usage_model === UsageModel.Prepaid}
          onClick={() => {
            if (item.usage_model !== UsageModel.Prepaid) {
              setItem({ ...item, usage_model: UsageModel.Prepaid });
            }
          }}
        />
      </div>
    </div>
  );
};
