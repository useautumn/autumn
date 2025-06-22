import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { ToggleButton } from "@/components/general/ToggleButton";
import { UsageModel } from "autumn-js";
import { useProductItemContext } from "../../../ProductItemContext";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";

export const PrepaidToggle = () => {
  const { item, setItem } = useProductItemContext();

  return (
    <div className="min-w-40 max-w-40">
      <FieldLabel>{"\u00A0"}</FieldLabel>
      <div className="flex items-center gap-2 w-full">
        <ToggleButton
          disabled={item.interval === null}
          value={item.usage_model === UsageModel.Prepaid}
          setValue={() => {
            setItem({
              ...item,
              usage_model:
                item.usage_model === UsageModel.Prepaid
                  ? UsageModel.PayPerUse
                  : UsageModel.Prepaid,
            });
          }}
          buttonText="Prepaid"
          className="text-xs gap-2 text-t3 p-1"
        />
        <InfoTooltip align="start">
          Prepaid means that the user will pay for the product upfront.
        </InfoTooltip>
      </div>
    </div>
  );
};
