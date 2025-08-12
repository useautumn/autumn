import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectType } from "@/components/general/SelectType";
import { CircleGauge, Cog, DollarSignIcon } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import { isFeaturePriceItem, isPriceItem } from "@/utils/product/getItemType";
import {
  defaultPaidFeatureItem,
  defaultPriceItem,
} from "../create-product-item/defaultItemConfigs";
import { useEffect, useState } from "react";
import { ConfigWithFeature } from "../components/ConfigWithFeature";
import CreateFixedPrice from "../../prices/CreateFixedPrice";
import { UsageModel } from "@autumn/shared";
import { nullish } from "@/utils/genUtils";

export const PriceItemConfig = () => {
  const { item, setItem } = useProductItemContext();

  // useEffect(() => {
  //   console.log("Item:", item);
  // }, [item]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="w-full">
        <FieldLabel>Price Type</FieldLabel>
        <div className="grid grid-cols-2 gap-2 w-full">
          <SelectType
            title="Fixed"
            description="A one off or fixed recurring price (eg. $20 / month)"
            icon={<Cog size={14} />}
            isSelected={item.isVariable === false}
            onClick={() => {
              if (item.isVariable !== false) {
                setItem({ ...item, tiers: null, isVariable: false });
              }
            }}
          />
          <SelectType
            title="Variable"
            description="A usage based price (eg. $0.01 per credit or $10 per seat)"
            icon={<CircleGauge size={13} />}
            isSelected={item.isVariable}
            onClick={() => {
              if (!item.isVariable) {
                setItem({ ...defaultPaidFeatureItem, isVariable: true });
              }
            }}
          />
        </div>
      </div>
      {item.isVariable === true && (
        <>
          <SelectUsageModel />
          {item.usage_model !== null && <ConfigWithFeature />}
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
      <FieldLabel>Price Type</FieldLabel>
      <div className="grid grid-cols-2 gap-2 w-full">
        <SelectType
          title="Upfront Quantity"
          description="Your user can specify a quantity of this feature before purchasing the product"
          icon={<Cog size={14} />}
          isSelected={item.usage_model === UsageModel.Prepaid}
          onClick={() => {
            if (item.usage_model !== UsageModel.Prepaid) {
              setItem({ ...item, usage_model: UsageModel.Prepaid });
            }
          }}
        />
        <SelectType
          title="Pay Per Use"
          description="Your user is charged based on number of units used of this feature"
          icon={<CircleGauge size={13} />}
          isSelected={item.usage_model === UsageModel.PayPerUse}
          onClick={() => {
            if (item.usage_model !== UsageModel.PayPerUse) {
              setItem({ ...item, usage_model: UsageModel.PayPerUse });
            }
          }}
          disabled={nullish(item.interval)}
        />
      </div>
    </div>
  );
};
