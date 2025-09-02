import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { Reward } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
import { RewardService } from "@/services/products/RewardService";
import { getBackendErr } from "@/utils/genUtils";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardConfig } from "./RewardConfig";

function UpdateReward({
  open,
  setOpen,
  selectedReward,
  setSelectedReward,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedReward: Reward | null;
  setSelectedReward: (reward: Reward) => void;
}) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const { refetch } = useRewardsQuery();

  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const handleUpdate = async () => {
    setUpdateLoading(true);
    try {
      await RewardService.updateReward({
        axiosInstance,
        internalId: selectedReward!.internal_id,
        data: selectedReward!,
      });
      toast.success("Reward updated successfully");
      await refetch();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update coupon"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[500px]">
        <DialogTitle>Update Reward</DialogTitle>
        <WarningBox>
          Existing customers with this coupon will not be affected
        </WarningBox>

        {selectedReward && (
          <RewardConfig reward={selectedReward} setReward={setSelectedReward} />
        )}

        <DialogFooter>
          <Button
            isLoading={updateLoading}
            onClick={() => handleUpdate()}
            variant="gradientPrimary"
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateReward;
