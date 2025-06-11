import {
  Feature,
  ProductItem,
  ProductItemFeatureType,
  UsageModel,
} from "@autumn/shared";
import { useProductItemContext } from "../ProductItemContext";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductContext } from "../../ProductContext";
import { itemToUsageType } from "@/utils/product/productItemUtils/convertItem";

import { OnIncreaseSelect } from "./prorationConfig/OnIncreaseSelect";
import { OnDecreaseSelect } from "./prorationConfig/OnDecreaseSelect";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { shouldShowProrationConfig } from "@/utils/product/productItemUtils";

export const ProrationConfig = () => {
  const { features } = useProductContext();
  const { item, setItem } = useProductItemContext();
  const [isOpen, setIsOpen] = useState(false);

  if (!shouldShowProrationConfig({ item, features })) return null;

  return (
    <div className="w-full h-fit">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 w-fit rounded-md text-t3 hover:text-zinc-800 transition-all duration-150 ease-out"
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform duration-150 ease-out ${
            isOpen ? "rotate-90" : "rotate-0"
          }`}
        />
        <span className="text-sm font-medium">Advanced</span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-150 ease-out ${
          isOpen ? "max-h-40 opacity-100 mt-2" : "max-h-0 opacity-0"
        }`}
      >
        <div className="grid grid-cols-2 gap-4 p-4 bg-stone-100">
          <OnIncreaseSelect />
          <OnDecreaseSelect />
        </div>
      </div>
    </div>
  );
};
