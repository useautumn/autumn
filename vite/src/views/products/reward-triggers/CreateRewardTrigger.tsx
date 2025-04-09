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
  RewardTrigger,
  RewardTriggerEvent,
} from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../ProductsContext";

import { RewardTriggerConfig } from "./RewardTriggerConfig";
// import { ReferralProgramService } from "@/services/products/ReferralProgramService";
import { CreateRewardTrigger } from "@autumn/shared";

const defaultRewardTrigger: CreateRewardTrigger = {
  id: "",
  // trigger: {
  //   type: RewardTriggerEvent.SignUp,
  //   product_ids: [],
  //   exclude_trial: false,
  // },
  when: RewardTriggerEvent.Immediately,
  product_ids: [],
  exclude_trial: false,
  internal_reward_id: "",
  max_redemptions: 0,
};

function CreateRewardTriggerModal() {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env: env });

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [rewardTrigger, setRewardTrigger] = useState(defaultRewardTrigger);

  useEffect(() => {
    if (open) {
      setRewardTrigger(defaultRewardTrigger);
    }
  }, [open]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      await axiosInstance.post("/v1/reward-triggers", rewardTrigger);

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
          Create Referral
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Referral</DialogTitle>
        </DialogHeader>
        <RewardTriggerConfig
          rewardTrigger={rewardTrigger as any}
          setRewardTrigger={setRewardTrigger}
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

export default CreateRewardTriggerModal;
