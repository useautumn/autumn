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
import { RewardProgram } from "@autumn/shared";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardProgramConfig } from "./RewardProgramConfig";
import { RewardProgramService } from "@/services/products/RewardProgramService";

function UpdateRewardProgram({
  open,
  setOpen,
  selectedRewardProgram,
  setSelectedRewardProgram,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedRewardProgram: RewardProgram | null;
  setSelectedRewardProgram: (reward: RewardProgram) => void;
}) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const { refetch } = useRewardsQuery();

  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const handleUpdate = async () => {
    setUpdateLoading(true);
    try {
      await RewardProgramService.updateReward({
        axiosInstance,
        internalId: selectedRewardProgram!.internal_id,
        data: selectedRewardProgram!,
      });
      toast.success("Reward updated successfully");
      await refetch();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update reward program"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[500px]">
        <DialogTitle>Update Reward Program</DialogTitle>
        {/* <WarningBox>
          Existing customers with this reward program will not be affected
        </WarningBox> */}

        {selectedRewardProgram && (
          <RewardProgramConfig
            rewardProgram={selectedRewardProgram}
            setRewardProgram={setSelectedRewardProgram}
            isUpdate={true}
          />
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

export default UpdateRewardProgram;
