import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductItem, ProductItemInterval } from "@autumn/shared";
import { ChevronRight, FlagIcon } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import {
  defaultFeatureItem,
  defaultPaidFeatureItem,
  defaultPriceItem,
} from "./defaultItemConfigs";

export const CreateItemIntro = ({
  setIntroDone,
}: {
  setIntroDone: (introDone: boolean) => void;
}) => {
  const { setItem } = useProductItemContext();

  const handleItemClicked = (itemType: string) => {
    if (itemType === "feature") {
      setItem(defaultFeatureItem);
    } else if (itemType === "paid feature") {
      setItem(defaultPaidFeatureItem);
    } else if (itemType === "price") {
      setItem(defaultPriceItem);
    }
    setIntroDone(true);
  };

  return (
    <div className="w-[500px] flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Select item type</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <ItemTypeCard
          itemType="Feature"
          description="Eg. 100 credits per month"
          onClick={() => handleItemClicked("feature")}
        />
        <ItemTypeCard
          itemType="Paid Feature"
          description="Eg. $0.5 per credit"
          onClick={() => handleItemClicked("paid feature")}
        />
        <ItemTypeCard
          itemType="Price"
          description="Eg. $10 per month"
          onClick={() => handleItemClicked("price")}
        />
      </div>
    </div>
  );
};

const ItemTypeCard = ({
  itemType,
  description,
  onClick,
}: {
  itemType: string;
  description: string;
  onClick: () => void;
}) => {
  return (
    <div
      className="flex justify-between items-center border p-3 bg-white rounded-lg cursor-pointer hover:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center text-md font-medium gap-2">
          <FlagIcon className="text-t3" size={12} />
          <p className="text-t2"> {itemType}</p>
        </div>
        <p className="text-t3 text-sm">{description}</p>
      </div>

      <ChevronRight className="text-t3 ml-8" size={14} />
    </div>
  );
};
