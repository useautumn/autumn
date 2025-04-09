import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { Reward } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
import { useProductsContext } from "../ProductsContext";
import { RewardConfig } from "./RewardConfig";
import { RewardService } from "@/services/products/RewardService";
import { getBackendErr } from "@/utils/genUtils";
import { WarningBox } from "@/components/general/modal-components/WarningBox";

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
  const { rewards, mutate } = useProductsContext();

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
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update coupon"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
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
