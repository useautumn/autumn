import { OnIncrease, ProductItemFeatureType, UsageModel } from "@autumn/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductItemContext } from "../../ProductItemContext";
import { useEffect } from "react";
import { ProrationSelect } from "./ProrationSelect";
import { itemToUsageType } from "@/utils/product/productItemUtils/convertItem";
import { useProductContext } from "../../../ProductContext";

const optionToText = (option: OnIncrease) => {
  switch (option) {
    case OnIncrease.BillImmediately:
      return "Pay full amount immediately";
    case OnIncrease.ProrateImmediately:
      return "Pay for prorated amount immediately";
    case OnIncrease.ProrateNextCycle:
      return "Add prorated amount to next invoice";
    case OnIncrease.BillNextCycle:
      return "Pay for full amount next cycle";
  }
};

export const OnIncreaseSelect = () => {
  const { item, setItem } = useProductItemContext();

  const value = item.config?.on_increase;

  useEffect(() => {
    if (!item.config?.on_increase) {
      console.log("Setting item on increase to default");
      setItem({
        ...item,
        config: {
          ...item.proration_config,
          on_increase: OnIncrease.ProrateImmediately,
        },
      });
    }
  }, [item]);

  const text =
    item.usage_model == UsageModel.PayPerUse
      ? "On usage increase"
      : "On quantity increase";

  return (
    <div className="flex flex-col gap-2 w-full">
      <p className="text-t3">{text}</p>
      <ProrationSelect
        value={value}
        setValue={(value) =>
          setItem({ ...item, config: { ...item.config, on_increase: value } })
        }
        optionToText={optionToText}
        options={Object.values(OnIncrease)}
      />
    </div>
  );
};
