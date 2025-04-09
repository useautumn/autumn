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
      <Table>
        <TableHeader className="rounded-full">
          <TableRow>
            <TableHead className="">Name</TableHead>
            <TableHead>Promo Codes</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Duration</TableHead>

            <TableHead className="min-w-0 w-28">Created At</TableHead>
            <TableHead className="min-w-0 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rewards.map((reward: Reward) => (
            <TableRow
              key={reward.internal_id}
              className="cursor-pointer"
              onClick={() => {
                setSelectedReward(reward);
                setOpen(true);
              }}
            >
              <TableCell className="font-medium">{reward.name}</TableCell>
              <TableCell className="font-mono">
                {reward.promo_codes
                  .map((promoCode) => promoCode.code)
                  .join(", ")}
              </TableCell>
              <TableCell className="min-w-32">
                <div className="flex items-center gap-1">
                  <p>{reward.discount_value} </p>
                  <p className="text-t3">
                    {reward.discount_type == DiscountType.Percentage
                      ? "%"
                      : org?.default_currency || "USD"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="">
                {reward.duration_type == CouponDurationType.Months
                  ? `${reward.duration_value} months`
                  : reward.duration_type == CouponDurationType.OneOff &&
                    reward.should_rollover
                  ? "One-off (rollover)"
                  : keyToTitle(reward.duration_type)}
              </TableCell>
              <TableCell className="">
                {formatUnixToDateTime(reward.created_at).date}
                <span className="text-t3">
                  {" "}
                  {formatUnixToDateTime(reward.created_at).time}{" "}
                </span>
              </TableCell>
              <TableCell className="">
                <RewardRowToolbar reward={reward} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
