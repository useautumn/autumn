import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useProductsContext } from "../ProductsContext";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { Reward, CouponDurationType, DiscountType } from "@autumn/shared";
import UpdateReward from "./UpdateReward";
import { useState } from "react";
import { RewardRowToolbar } from "./RewardRowToolbar";
import { Item, Row } from "@/components/general/TableGrid";
import { AdminHover } from "@/components/general/AdminHover";

export const RewardsTable = () => {
  const { rewards, org } = useProductsContext();
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [open, setOpen] = useState(false);

  // const handleRowClick = (id: string) => {
  //   const creditSystem = creditSystems.find(
  //     (creditSystem: Feature) => creditSystem.id === id
  //   );
  //   console.log(creditSystem);
  //   if (!creditSystem) return;

  //   setSelectedCreditSystem(creditSystem);
  //   setOpen(true);
  // };

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
          <Item className="col-span-4">Discount</Item>
          <Item className="col-span-3">Duration</Item>
          <Item className="col-span-2">Created At</Item>
          <Item className="col-span-1"></Item>
        </Row>
      ) : (
        <div className="flex justify-start items-center h-10 text-t3">
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
          <Item className="col-span-4">
            <div className="flex items-center gap-1">
              <p>{reward.discount_value}</p>
              <p className="text-t3">
                {reward.discount_type == DiscountType.Percentage
                  ? "%"
                  : org?.default_currency || "USD"}
              </p>
            </div>
          </Item>
          <Item className="col-span-3">
            {reward.duration_type == CouponDurationType.Months
              ? `${reward.duration_value} months`
              : reward.duration_type == CouponDurationType.OneOff &&
                reward.should_rollover
              ? "One-off (rollover)"
              : keyToTitle(reward.duration_type)}
          </Item>
          <Item className="col-span-2">
            {formatUnixToDateTime(reward.created_at).date}
            <span className="text-t3">
              {" "}
              {formatUnixToDateTime(reward.created_at).time}
            </span>
          </Item>
          <Item className="col-span-1 items-center justify-end">
            <RewardRowToolbar reward={reward} />
          </Item>
        </Row>
      ))}
    </>
  );
};
