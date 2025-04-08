import { useProductsContext } from "../ProductsContext";

import { useState } from "react";

import { CouponRowToolbar } from "../coupons/CouponRowToolbar";

import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

import { TableCell } from "@/components/ui/table";

import {
  Coupon,
  CouponDurationType,
  DiscountType,
  RewardTrigger,
  RewardTriggerEvent,
} from "@autumn/shared";

import { TableBody } from "@/components/ui/table";

import { Table, TableHead, TableRow, TableHeader } from "@/components/ui/table";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

export const RewardTriggersTable = () => {
  const { org } = useProductsContext();
  const [selectedRewardTrigger, setSelectedRewardTrigger] =
    useState<RewardTrigger | null>(null);
  const [open, setOpen] = useState(false);

  let rewardTriggers: RewardTrigger[] = [];
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
      {/* <UpdateCoupon
        open={open}
        setOpen={setOpen}
        selectedCoupon={selectedCoupon}
        setSelectedCoupon={setSelectedCoupon}
      /> */}
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
          {rewardTriggers.map((rewardTrigger: RewardTrigger) => (
            <TableRow
              key={rewardTrigger.id}
              className="cursor-pointer"
              onClick={() => {
                setSelectedRewardTrigger(rewardTrigger);
                setOpen(true);
              }}
            >
              <TableCell className="font-medium">
                {rewardTrigger.name}
              </TableCell>
              <TableCell className="font-mono">
                {rewardTrigger.trigger.type}
              </TableCell>
              <TableCell className="min-w-32">
                <div className="flex items-center gap-1">
                  <p>{rewardTrigger.max_redemptions} </p>
                  <p className="text-t3">
                    {rewardTrigger.unlimited_redemptions
                      ? "Unlimited"
                      : rewardTrigger.max_redemptions}
                  </p>
                </div>
              </TableCell>
              <TableCell className="">
                {rewardTrigger.trigger.type == RewardTriggerEvent.SignUp
                  ? "Sign Up"
                  : rewardTrigger.trigger.type == RewardTriggerEvent.Checkout
                  ? "Checkout"
                  : keyToTitle(rewardTrigger.trigger.type)}
              </TableCell>
              <TableCell className="">
                {formatUnixToDateTime(rewardTrigger.created_at).date}
                <span className="text-t3">
                  {" "}
                  {formatUnixToDateTime(rewardTrigger.created_at).time}{" "}
                </span>
              </TableCell>
              <TableCell className="">
                {/* <RewardTriggerRowToolbar rewardTrigger={rewardTrigger} /> */}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
};
