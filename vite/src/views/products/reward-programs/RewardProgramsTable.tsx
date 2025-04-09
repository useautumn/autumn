import { useProductsContext } from "../ProductsContext";

import { useState } from "react";

import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";

import { TableCell } from "@/components/ui/table";

import {
  Reward,
  CouponDurationType,
  DiscountType,
  RewardProgram,
  RewardTriggerEvent,
} from "@autumn/shared";

import { TableBody } from "@/components/ui/table";

import { Table, TableHead, TableRow, TableHeader } from "@/components/ui/table";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { RewardProgramRowToolbar } from "./RewardProgramRowToolbar";

export const RewardProgramsTable = () => {
  const { rewardPrograms } = useProductsContext();
  const [selectedRewardProgram, setSelectedRewardProgram] =
    useState<RewardProgram | null>(null);
  const [open, setOpen] = useState(false);

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
          {rewardPrograms.map((rewardProgram: RewardProgram) => {
            return (
              <TableRow
                key={rewardProgram.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedRewardProgram(rewardProgram);
                  setOpen(true);
                }}
              >
                <TableCell className="font-medium font-mono">
                  {rewardProgram.id}
                </TableCell>
                <TableCell className="font-mono">
                  {rewardProgram.when}
                </TableCell>
                <TableCell className="min-w-32">
                  <div className="flex items-center gap-1">
                    <p className="text-t3">
                      {rewardProgram.unlimited_redemptions
                        ? "Unlimited"
                        : rewardProgram.max_redemptions}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="">
                  {rewardProgram.when == RewardTriggerEvent.CustomerCreation
                    ? "Sign Up"
                    : rewardProgram.when == RewardTriggerEvent.Checkout
                    ? "Checkout"
                    : keyToTitle(rewardProgram.when)}
                </TableCell>
                <TableCell className="">
                  {formatUnixToDateTime(rewardProgram.created_at).date}
                  <span className="text-t3">
                    {" "}
                    {formatUnixToDateTime(rewardProgram.created_at).time}{" "}
                  </span>
                </TableCell>
                <TableCell className="">
                  <RewardProgramRowToolbar rewardProgram={rewardProgram} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};
