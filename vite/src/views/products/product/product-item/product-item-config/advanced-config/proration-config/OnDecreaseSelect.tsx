import { OnDecrease, UsageModel } from "@autumn/shared";
import { useProductItemContext } from "../../../ProductItemContext";
import { ProrationSelect } from "./ProrationSelect";
import { nullish } from "zod/v4";

const optionToText = (option: OnDecrease) => {
  switch (option) {
    case OnDecrease.Prorate:
      return "Prorate";
    case OnDecrease.None:
      return "No proration (usage will be kept till next cycle)";
  }
};

export const OnDecreaseSelect = () => {
  const { item, setItem } = useProductItemContext();

  const getOnDecreaseVal = () => {
    if (nullish(item.config?.on_decrease)) {
      return OnDecrease.Prorate;
    }

    if (
      item.config?.on_decrease == OnDecrease.ProrateImmediately ||
      item.config?.on_decrease == OnDecrease.ProrateNextCycle ||
      item.config?.on_decrease == OnDecrease.Prorate
    ) {
      return OnDecrease.Prorate;
    }

    return OnDecrease.None;
  };

  // useEffect(() => {
  //   if (!item.config?.on_decrease) {
  //     setItem({
  //       ...item,
  //       config: {
  //         ...item.config,
  //         on_decrease: OnDecrease.Prorate,
  //       },
  //     });
  //   }
  // }, [item]);

  const text =
    item.usage_model == UsageModel.PayPerUse
      ? "On usage decrease"
      : "On quantity decrease";

  return (
    <div className="flex flex-col gap-2 w-full">
      <p className="text-t3">{text}</p>

      <ProrationSelect
        value={getOnDecreaseVal()}
        setValue={(value) => {
          setItem({
            ...item,
            config: { ...item.config, on_decrease: value },
          });
        }}
        optionToText={optionToText}
        options={[OnDecrease.Prorate, OnDecrease.None]}
      />
    </div>
  );
};
