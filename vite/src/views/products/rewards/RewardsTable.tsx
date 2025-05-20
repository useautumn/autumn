import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useProductsContext } from "../ProductsContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Reward, RewardType, Product } from "@autumn/shared";
import UpdateReward from "./UpdateReward";
import { useState } from "react";
import { RewardRowToolbar } from "./RewardRowToolbar";
import { Item, Row } from "@/components/general/TableGrid";
import { AdminHover } from "@/components/general/AdminHover";

export const RewardsTable = () => {
  const { rewards, org, products } = useProductsContext();
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [open, setOpen] = useState(false);

  console.log("products: ", products);

  return (
    <>
      <UpdateReward
        open={open}
        setOpen={setOpen}
        selectedReward={selectedReward}
        setSelectedReward={setSelectedReward}
      />
      {rewards && rewards.length > 0 ? (
        <Row type="header" className="grid-cols-18 -mb-1">
          <Item className="col-span-4">Name</Item>
          <Item className="col-span-4">Promo Codes</Item>
          <Item className="col-span-4">Type</Item>
          <Item className="col-span-3">Reward</Item>
          <Item className="col-span-2">Created At</Item>
          <Item className="col-span-1"></Item>
        </Row>
      ) : (
        <div className="flex justify-start items-center h-10 text-t3 px-10">
          Create a coupon that customers can redeem for discounts, credits or
          free products.
        </div>
      )}

      {rewards.map((reward: Reward) => (
        <Row
          key={reward.internal_id}
          className="grid-cols-18 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap"
          onClick={() => {
            setSelectedReward(reward);
            setOpen(true);
          }}
        >
          <Item className="col-span-4">
            <AdminHover
              texts={[{ key: "Internal ID", value: reward.internal_id }]}
            >
              <span className="truncate">{reward.name}</span>
            </AdminHover>
          </Item>
          <Item className="col-span-4 font-mono">
            <span className="truncate">
              {reward.promo_codes.map((promoCode) => promoCode.code).join(", ")}
            </span>
          </Item>
          <Item className="col-span-4">{keyToTitle(reward.type)}</Item>
          <Item className="col-span-3">
            {reward.type == RewardType.FreeProduct ? (
              products.find((p: Product) => p.id == reward.free_product_id)
                ?.name
            ) : (
              <span>
                {reward.discount_config?.discount_value}
                {reward.type == RewardType.PercentageDiscount
                  ? "%"
                  : ` ${org.default_currency || "USD"}`}{" "}
                off
              </span>
            )}
          </Item>
          <Item className="col-span-2 text-t3 text-xs">
            {formatUnixToDateTime(reward.created_at).date}
          </Item>
          <Item className="col-span-1 items-center justify-end">
            <RewardRowToolbar reward={reward} />
          </Item>
        </Row>
      ))}
    </>
  );
};
