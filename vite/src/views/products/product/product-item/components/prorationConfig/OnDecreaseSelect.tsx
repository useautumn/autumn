import { OnDecrease, OnIncrease, UsageModel } from "@autumn/shared";
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

const optionToText = (option: OnDecrease) => {
  switch (option) {
    case OnDecrease.ProrateImmediately:
      return "Refund prorated amount immediately";
    case OnDecrease.ProrateNextCycle:
      return "Add prorated amount to next cycle";
    case OnDecrease.None:
      return "No proration (usage will be kept till next cycle)";
  }
};

export const OnDecreaseSelect = () => {
  const { item, setItem } = useProductItemContext();

  const value = item.config?.on_decrease;

  useEffect(() => {
    if (!item.config?.on_decrease) {
      setItem({
        ...item,
        config: {
          ...item.config,
          on_decrease: OnDecrease.ProrateImmediately,
        },
      });
    }
  }, [item]);

  const text =
    item.usage_model == UsageModel.PayPerUse
      ? "On usage decrease"
      : "On quantity decrease";

  return (
    <div className="flex flex-col gap-2 w-full">
      <p className="text-t3">{text}</p>

      <ProrationSelect
        value={value}
        setValue={(value) =>
          setItem({ ...item, config: { ...item.config, on_decrease: value } })
        }
        optionToText={optionToText}
        options={Object.values(OnDecrease)}
      />
    </div>
  );
};
