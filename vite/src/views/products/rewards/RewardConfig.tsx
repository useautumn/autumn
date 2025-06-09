import FieldLabel from "@/components/general/modal-components/FieldLabel";

import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { keyToTitle, slugify } from "@/utils/formatUtils/formatTextUtils";
import {
  Reward,
  RewardType,
  Product,
  FullProduct,
  ProductV2,
} from "@autumn/shared";
import { useProductsContext } from "../ProductsContext";
import { DiscountConfig } from "./DiscountConfig";
import { notNullish } from "@/utils/genUtils";
import { defaultDiscountConfig } from "./defaultRewardModels";
import { isFreeProduct } from "@/utils/product/priceUtils";

export const RewardConfig = ({
  reward,
  setReward,
}: {
  reward: Reward;
  setReward: (reward: Reward) => void;
}) => {
  const { products } = useProductsContext();

  const [idChanged, setIdChanged] = useState(false);

  useEffect(() => {
    if (!idChanged) {
      setReward({
        ...reward,
        id: slugify(reward.name || ""),
      });
    }
  }, [reward.name]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-6/12">
          <FieldLabel description="Will be shown on receipt">Name</FieldLabel>
          <Input
            value={reward.name || ""}
            onChange={(e) => setReward({ ...reward, name: e.target.value })}
          />
        </div>
        <div className="w-6/12">
          <FieldLabel description="Used to identify reward in API">
            ID
          </FieldLabel>
          <Input
            value={reward.id || ""}
            onChange={(e) => {
              setReward({ ...reward, id: e.target.value });
              setIdChanged(true);
            }}
          />
        </div>
      </div>
      <div className="flex items-center w-full gap-2">
        <div className="w-full">
          <FieldLabel>Promotional Code</FieldLabel>
          <Input
            value={
              reward.promo_codes.length > 0 ? reward.promo_codes[0].code : ""
            }
            onChange={(e) =>
              setReward({
                ...reward,
                promo_codes: [{ code: e.target.value }],
              })
            }
          />
        </div>
        <div className="w-full">
          <FieldLabel>Type</FieldLabel>
          <Select
            value={reward.type}
            onValueChange={(value) => {
              setReward({
                ...reward,
                type: value as RewardType,
                discount_config:
                  value === RewardType.FreeProduct
                    ? null
                    : defaultDiscountConfig,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a discount type" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(RewardType).map((type) => (
                <SelectItem key={type} value={type}>
                  {keyToTitle(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {reward.type === RewardType.FreeProduct ? (
        <div>
          <FieldLabel description="Select a free add-on product to give away">
            Product
          </FieldLabel>
          <Select
            value={reward.free_product_id || undefined}
            onValueChange={(value) =>
              setReward({ ...reward, free_product_id: value })
            }
          >
            {(() => {
              const freeAddOns = products
                .filter((product: ProductV2) => product.is_add_on)
                .filter((product: ProductV2) => isFreeProduct(product.items));

              const empty = freeAddOns.length === 0;
              return (
                <>
                  <SelectTrigger disabled={empty}>
                    <SelectValue
                      placeholder={
                        empty
                          ? "Create a free add-on product first"
                          : "Select a product"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {freeAddOns.map((product: Product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </>
              );
            })()}
          </Select>
        </div>
      ) : notNullish(reward.type) ? (
        <DiscountConfig reward={reward} setReward={setReward} />
      ) : null}
    </div>
  );
};
