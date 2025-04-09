import { useProductsContext } from "../ProductsContext";

import { useState } from "react";

import { CouponRowToolbar } from "../coupons/CouponRowToolbar";

import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

import { TableCell } from "@/components/ui/table";

import {
  Reward,
  CouponDurationType,
  DiscountType,
  RewardTrigger,
  RewardTriggerEvent,
} from "@autumn/shared";

import { TableBody } from "@/components/ui/table";

import { Table, TableHead, TableRow, TableHeader } from "@/components/ui/table";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { RewardTriggerRowToolbar } from "./RewardTriggerRowToolbar";

export const RewardTriggersTable = () => {
  const { rewardTriggers } = useProductsContext();
  const [selectedRewardTrigger, setSelectedRewardTrigger] =
    useState<RewardTrigger | null>(null);
  const [open, setOpen] = useState(false);

  // let rewardTriggers: RewardTrigger[] = [];
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
            <TableHead className="">ID</TableHead>
            <TableHead>Redeem On</TableHead>
            <TableHead>Max Redemptions</TableHead>
            <TableHead>Products</TableHead>

            <TableHead className="min-w-0 w-28">Created At</TableHead>
            <TableHead className="min-w-0 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rewardTriggers.map((rewardTrigger: RewardTrigger) => {
            return (
              <TableRow
                key={rewardTrigger.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedRewardTrigger(rewardTrigger);
                  setOpen(true);
                }}
              >
                <TableCell className="font-medium font-mono">
                  {rewardTrigger.id}
                </TableCell>
                <TableCell className="font-mono">
                  {rewardTrigger.when}
                </TableCell>
                <TableCell className="min-w-32">
                  <div className="flex items-center gap-1">
                    <p className="text-t3">
                      {rewardTrigger.unlimited_redemptions
                        ? "Unlimited"
                        : rewardTrigger.max_redemptions}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="">
                  {rewardTrigger.when == RewardTriggerEvent.Immediately
                    ? "Sign Up"
                    : rewardTrigger.when == RewardTriggerEvent.Checkout
                    ? "Checkout"
                    : keyToTitle(rewardTrigger.when)}
                </TableCell>
                <TableCell className="">
                  {formatUnixToDateTime(rewardTrigger.created_at).date}
                  <span className="text-t3">
                    {" "}
                    {formatUnixToDateTime(rewardTrigger.created_at).time}{" "}
                  </span>
                </TableCell>
                <TableCell className="">
                  <RewardTriggerRowToolbar rewardTrigger={rewardTrigger} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};
