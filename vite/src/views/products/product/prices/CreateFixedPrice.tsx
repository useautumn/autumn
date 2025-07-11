import { Input } from "@/components/ui/input";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { useProductContext } from "../ProductContext";
import { SelectCycle } from "../product-item/product-item-config/components/feature-price/SelectBillingCycle";
import { useProductItemContext } from "../product-item/ProductItemContext";
import {
  ProductItem,
  ProductItemInterval,
  UpdateProductSchema,
} from "@autumn/shared";
import { isPriceItem } from "@/utils/product/getItemType";
import { useEffect, useState } from "react";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { getBackendErr, getRedirectUrl } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";
import { useNavigate } from "react-router";

function CreateFixedPrice({
  config,
  setConfig,
  show,
  setShow,
}: {
  config: any;
  setConfig: (config: any) => void;
  show: any;
  setShow: (show: any) => void;
}) {
  const { item, selectedIndex } = useProductItemContext();
  const { org, product, counts, hasChanges } = useProductContext();
  const [copyLoading, setCopyLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const env = useEnv();
  const navigate = useNavigate();

  const curFixedPrice = product.items.find(
    (item: ProductItem, index: number) => {
      const isSameItem = selectedIndex && selectedIndex == index;
      return !isSameItem && isPriceItem(item) && item.interval;
    },
  );

  const newVariantMap: Record<ProductItemInterval, string> = {
    [ProductItemInterval.Year]: "annual",
    [ProductItemInterval.SemiAnnual]: "semi-annual",
    [ProductItemInterval.Quarter]: "quarterly",
    [ProductItemInterval.Month]: "monthly",
    [ProductItemInterval.Week]: "weekly",
    [ProductItemInterval.Day]: "daily",
    [ProductItemInterval.Minute]: "minute",
    [ProductItemInterval.Hour]: "hourly",
  };

  const intervalWarning = () => {
    if (!curFixedPrice || !item.interval) {
      return null;
    }

    if (item.interval == curFixedPrice.interval) {
      return null;
    }

    const newIntervalText =
      item.interval == ProductItemInterval.Year
        ? "an annual"
        : `a ${newVariantMap[item.interval! as ProductItemInterval]}`;

    return `A fixed price already exists on this product. If you're looking to create ${newIntervalText} version, you should create a new product instead.`;
  };

  const copyProductClicked = async () => {
    setCopyLoading(true);

    try {
      if (hasChanges) {
        if (counts?.all > 0) {
          toast.error("Please save the current changes to your product first");
          return;
        }

        await ProductService.updateProduct(axiosInstance, product.id, {
          ...UpdateProductSchema.parse(product),
          items: product.items,
          free_trial: product.free_trial,
        });
      }

      const variantName = newVariantMap[item.interval! as ProductItemInterval];
      const newId = `${product.id}_${variantName}`;
      await ProductService.copyProduct(axiosInstance, product.id, {
        id: newId,
        name: `${product.name} - ${variantName}`,
        env: env,
      });

      await navigate(getRedirectUrl(`/products/${newId}`, env));
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <div>
      {/* <p className="text-t3 text-md mt-4 mb-2 font-medium">Rates</p> */}
      <div className="flex flex-col w-full gap-6 animate-in fade-in duration-300 !overflow-visible">
        <div className="w-full flex flex-col">
          <FieldLabel>Fixed Price</FieldLabel>
          <div className="flex h-full items-center justify-between gap-2 !overflow-visible">
            <Input
              value={config.price}
              onChange={(e) => {
                setConfig({ ...config, price: e.target.value });
              }}
              placeholder="30.00"
              type="number"
              step="any"
              className="h-full !text-lg min-w-36"
            />
            <span className="text-t2 w-fit px-6 flex justify-center">
              {org?.default_currency?.toUpperCase() || "USD"}
            </span>
          </div>
        </div>
        <div className="w-full">
          <SelectCycle />
        </div>
        {intervalWarning() && (
          <WarningBox className="py-2">
            <div className="flex flex-col gap-2 relative">
              <div>{intervalWarning()}</div>

              <div className="flex w-full p-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit gap-1 !max-h-5 text-xs -mx-2  text-yellow-500 hover:text-yellow-700 hover:bg-transparent"
                  endIcon={<ArrowRight size={12} />}
                  isLoading={copyLoading}
                  onClick={copyProductClicked}
                >
                  Copy Product
                </Button>
              </div>
            </div>
          </WarningBox>
        )}
      </div>
    </div>
  );
}

export default CreateFixedPrice;
