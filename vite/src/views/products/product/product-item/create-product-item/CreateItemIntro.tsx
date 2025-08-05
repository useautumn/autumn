import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductItem, ProductItemInterval } from "@autumn/shared";
import { ChevronRight, FlagIcon, ScanBarcode, Wallet } from "lucide-react";
import { useProductItemContext } from "../ProductItemContext";
import {
  defaultFeatureItem,
  defaultPaidFeatureItem,
  defaultPriceItem,
} from "./defaultItemConfigs";
import { CustomDialogBody } from "@/components/general/modal-components/DialogContentWrapper";
import { CreateItemStep } from "../utils/CreateItemStep";
import { useProductContext } from "../../ProductContext";
import { CodeSpan } from "@/views/onboarding2/integrate/components/CodeSpan";

export const CreateItemIntro = ({
  setStep,
}: {
  setStep: (step: CreateItemStep) => void;
}) => {
  const { features } = useProductContext();
  const { setItem } = useProductItemContext();

  const handleItemClicked = (itemType: string) => {
    const hasFeatures = features.length > 0;
    const nextStep =
      itemType == "price"
        ? CreateItemStep.CreateItem
        : !hasFeatures && itemType.includes("feature")
          ? CreateItemStep.CreateFeature
          : CreateItemStep.CreateItem;

    if (itemType === "feature") {
      setItem(defaultFeatureItem);
    } else if (itemType === "paid feature") {
      setItem(defaultPaidFeatureItem);
    } else if (itemType === "price") {
      setItem(defaultPriceItem);
    }
    setStep(nextStep);
  };

  return (
    <CustomDialogBody>
      <div className="flex flex-col gap-4 w-md">
        <DialogHeader>
          <DialogTitle>Select item type</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-t2 text-sm">
            Think of product items as the lines on your pricing card.
          </p>
          <div className="flex flex-col gap-4">
            <ItemTypeCard
              itemType="Feature"
              description={
                <p>
                  A feature that your customers can access or consume <br />
                  <span className="fond-medium">
                    Example: 100 AI messages per month
                  </span>
                </p>
              }
              onClick={() => handleItemClicked("feature")}
              icon={<FlagIcon className="text-t3" size={14} />}
            />
            <ItemTypeCard
              itemType="Paid Feature"
              description={
                <p>
                  Usage-based feature that you will charge your customers for
                  Example: $0.5 per AI credit, or $10 per seat
                </p>
              }
              onClick={() => handleItemClicked("paid feature")}
              icon={<ScanBarcode className="text-t3" size={14} />}
            />
            <ItemTypeCard
              itemType="Fixed Price"
              description={
                <p>
                  The base price of this product
                  <br />
                  <span className="fond-medium">Example: $10 per month</span>
                </p>
              }
              onClick={() => handleItemClicked("price")}
              icon={<Wallet className="text-t3" size={14} />}
            />
          </div>
        </div>
      </div>
    </CustomDialogBody>
  );
};

const ItemTypeCard = ({
  itemType,
  description,
  onClick,
  icon,
}: {
  itemType: string;
  description: any;
  onClick: () => void;
  icon: React.ReactNode;
}) => {
  return (
    <div
      className="flex justify-between items-center border p-3 bg-white rounded-lg cursor-pointer hover:bg-gray-50"
      onClick={onClick}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center text-md font-medium gap-2">
          {icon}
          <p className="text-t2"> {itemType}</p>
        </div>
        <div className="text-t2 text-sm">{description}</div>
      </div>

      <ChevronRight className="text-t3 ml-8" size={14} />
    </div>
  );
};
