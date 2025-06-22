import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { Infinite } from "@autumn/shared";
import { useProductItemContext } from "../../ProductItemContext";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";

export const IncludedUsage = () => {
  const { item, setItem } = useProductItemContext();
  const isFeaturePrice = isFeaturePriceItem(item);

  return (
    <div className="w-full transition-all duration-400 ease-in-out whitespace-nowrap">
      <FieldLabel className="flex items-center gap-2">
        Included Usage
        <InfoTooltip>
          <span className="">
            How much usage of this feature is included for free. If there is no
            price, it is a usage limit.
          </span>
        </InfoTooltip>
      </FieldLabel>
      <div className="flex w-full h-fit gap-2">
        <Input
          placeholder="None"
          className=""
          disabled={item.included_usage == Infinite}
          value={
            item.included_usage == Infinite
              ? "Unlimited"
              : item.included_usage || ""
          }
          type={item.included_usage === Infinite ? "text" : "number"}
          onChange={(e) => {
            setItem({
              ...item,
              included_usage: e.target.value,
            });
          }}
        />
        <ToggleDisplayButton
          label="Unlimited"
          show={item.included_usage == Infinite}
          className="h-8"
          disabled={isFeaturePrice}
          onClick={() => {
            if (itemIsUnlimited(item)) {
              setItem({
                ...item,
                included_usage: "",
              });
            } else {
              setItem({
                ...item,
                included_usage: Infinite,
                interval: null,
              });
            }
          }}
        >
          ♾️
        </ToggleDisplayButton>
      </div>
    </div>
  );
};
