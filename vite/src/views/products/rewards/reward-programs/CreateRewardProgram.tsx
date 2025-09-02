import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";

import { RewardTriggerEvent, RewardReceivedBy } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { CreateRewardProgram } from "@autumn/shared";
import { RewardProgramConfig } from "./RewardProgramConfig";

const defaultRewardProgram: CreateRewardProgram = {
  id: "",
  // trigger: {
  //   type: RewardTriggerEvent.SignUp,
  //   product_ids: [],
  //   exclude_trial: false,
  // },
  when: RewardTriggerEvent.CustomerCreation,
  product_ids: [],
  exclude_trial: false,
  internal_reward_id: "",
  max_redemptions: 0,
  received_by: RewardReceivedBy.Referrer,
};

function CreateRewardProgramModal() {
  const { refetch } = useRewardsQuery();
  const axiosInstance = useAxiosInstance();

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [rewardProgram, setRewardProgram] = useState(defaultRewardProgram);

  useEffect(() => {
    if (open) {
      setRewardProgram(defaultRewardProgram);
    }
  }, [open]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      await axiosInstance.post("/v1/reward_programs", rewardProgram);

      await refetch();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create referral program"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add">Referral Program</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Referral Program</DialogTitle>
        </DialogHeader>
        <RewardProgramConfig
          rewardProgram={rewardProgram as any}
          setRewardProgram={setRewardProgram}
        />
        <DialogFooter>
          <Button
            onClick={handleCreate}
            isLoading={isLoading}
            variant="gradientPrimary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateRewardProgramModal;
