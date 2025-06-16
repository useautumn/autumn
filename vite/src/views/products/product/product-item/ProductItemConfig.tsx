import {
  Feature,
  FeatureType,
  FeatureUsageType,
  Infinite,
  ProductItemFeatureType,
  ProductItemInterval,
  TierInfinite,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { cn } from "@/lib/utils";
import { useProductItemContext } from "./ProductItemContext";
import {
  getShowParams,
  shouldShowProrationConfig,
} from "@/utils/product/productItemUtils";
import { ConfigWithFeature } from "./components/ConfigWithFeature";
import FixedPriceConfig from "./components/ConfigFixedPrice";
import { getFeature } from "@/utils/product/entitlementUtils";

export const ProductItemConfig = () => {
  // HOOKS
  const { features, product, env, entityFeatureIds } = useProductContext();

  const {
    item,
    setItem,
    isUpdate,
    handleCreateProductItem,
    handleUpdateProductItem,
    handleDeleteProductItem,
  } = useProductItemContext();

  const [show, setShow] = useState(getShowParams(item));

  const selectedFeature = features.find(
    (f: Feature) => f.id == item.feature_id,
  );

  const handleAddPrice = () => {
    setItem({
      ...item,
      tiers: [
        {
          to: TierInfinite,
          amount: item.price ?? 0,
        },
      ],
      interval: ProductItemInterval.Month,
    });
    setShow({ ...show, price: !show.price });
  };

  useEffect(() => {
    setShow(getShowParams(item));
  }, []);

  useEffect(() => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);
    if (feature) {
      if (feature.type == FeatureType.Boolean) {
        setItem({
          feature_id: item.feature_id,
          feature_type: ProductItemFeatureType.Static,
        });
      } else {
        setItem({
          ...item,
          feature_type: feature.config?.usage_type,
          reset_usage_when_enabled:
            feature.config?.usage_type == FeatureUsageType.Continuous
              ? false
              : true,
        });
      }
    }
    const showProration = shouldShowProrationConfig({ item, features });
    if (!showProration) {
      console.log("Setting item proration config to null");
      setItem({
        ...item,
        config: null,
      });
    }
  }, [item.feature_id, item.usage_model]);

  useEffect(() => {
    if (!show.perEntity) {
      setItem({
        ...item,
        entity_feature_id: null,
      });
    }

    if (!show.price) {
      setItem({
        ...item,
        price: null,
        tiers: null,
      });
    }
  }, [show.perEntity, show.price]);

  return (
    <div
      className={cn(
        "flex flex-col gap-6 w-lg transition-all ease-in-out duration-300 !overflow-visible", //modal animations
        !show.feature && "w-xs",
        show.feature && show.price && "w-xl",
        show.price && show.feature && item.tiers?.length > 1 && "w-2xl",
      )}
    >
      {!show.feature ? (
        <div className="flex w-full !overflow-visible">
          <FixedPriceConfig show={show} setShow={setShow} />
        </div>
      ) : (
        <ConfigWithFeature
          show={show}
          setShow={setShow}
          handleAddPrice={handleAddPrice}
        />
      )}
      <div className="flex animate-in slide-in-from-bottom-1/2 duration-200 fade-out w-full justify-end">
        <div className="flex flex-col justify-between gap-10 w-full">
          <div className="flex gap-6 w-full">
            <div className="flex gap-2 w-full ">
              <Button
                variant="outline"
                onClick={handleAddPrice}
                disabled={item.included_usage == Infinite}
                className={cn(
                  "w-0 max-w-0 p-0 overflow-hidden transition-all duration-200 ease-in-out",
                  !show.price &&
                    show.feature &&
                    getFeature(item.feature_id, features)?.type !=
                      FeatureType.Boolean
                    ? "w-full max-w-32 mr-0 p-2"
                    : "w-0 max-w-0 p-0 border-none",
                )}
              >
                <PlusIcon size={14} className="mr-1" />
                Add Price
              </Button>
              <Button
                className={cn(
                  "w-0 max-w-0 p-0 overflow-hidden transition-all duration-200 ease-in-out -ml-2",
                  !show.feature && !isUpdate
                    ? "w-full max-w-32 mr-0 p-2"
                    : "w-0 max-w-0 p-0 border-none",
                )}
                variant="outline"
                onClick={() => {
                  setShow({
                    ...show,
                    feature: true,
                    price: item.price > 0 ? true : false,
                  });
                  setItem({
                    ...item,
                    tiers: item.price
                      ? [
                          {
                            to: TierInfinite,
                            amount: item.price ?? 0,
                          },
                        ]
                      : null,
                  });
                }}
              >
                <PlusIcon size={14} className="mr-1" />
                Add Feature
              </Button>
            </div>
            <div className="flex gap-2 w-full ">
              {handleDeleteProductItem && (
                <Button
                  variant="destructive"
                  className="w-32 max-w-64 "
                  onClick={() => {
                    handleDeleteProductItem();
                  }}
                >
                  Delete
                </Button>
              )}
              {handleUpdateProductItem && (
                <Button
                  variant="gradientPrimary"
                  className="w-full"
                  onClick={() => {
                    handleUpdateProductItem(show);
                  }}
                >
                  Update Item
                </Button>
              )}
              {handleCreateProductItem &&
              show.feature &&
              item.feature_id &&
              !entityFeatureIds.includes(item.feature_id) &&
              entityFeatureIds.length > 0 ? (
                <>
                  <Select
                    onValueChange={async (value) => {
                      setItem({
                        ...item,
                        entity_feature_id: value,
                      });
                      handleCreateProductItem(
                        show,
                        value != product.name ? value : null,
                      );
                    }}
                  >
                    <SelectTrigger
                      className="w-full bg-primary data-[placeholder]:text-white bg-gradient-to-b font-semibold border border-primary rounded-sm from-primary/85 to-primary text-white hover:from-primary hover:to-primary shadow-purple-500/50 transition-[background] duration-300 !h-7.5 mt-0.25 flex justify-center items-center gap-2"
                      disabled={!selectedFeature && !item.price}
                    >
                      <SelectValue placeholder="Add Item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={product.name}>
                        {product.name} (Product)
                      </SelectItem>
                      {entityFeatureIds.map((entityFeatureId: string) => (
                        <SelectItem
                          key={entityFeatureId}
                          value={entityFeatureId}
                        >
                          {entityFeatureId} (Entity)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  {handleCreateProductItem && (
                    <Button
                      variant="gradientPrimary"
                      disabled={!selectedFeature && !item.price}
                      className="w-full"
                      onClick={() => {
                        handleCreateProductItem(show);
                      }}
                    >
                      Add Item
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
