import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectContent } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import {
  Reward,
  CouponDurationType,
  CreateReward as CreateCouponType,
  DiscountType,
  RewardProgram,
  RewardTriggerEvent,
} from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../ProductsContext";

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
};

function CreateRewardProgramModal() {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env: env });

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

      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create referral program"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Referral Program
        </Button>
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
