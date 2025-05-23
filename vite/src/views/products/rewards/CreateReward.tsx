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
  CreateReward as CreateRewardType,
  DiscountType,
  RewardType,
} from "@autumn/shared";

import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../ProductsContext";
import { RewardService } from "@/services/products/RewardService";
import { RewardConfig } from "./RewardConfig";
import { defaultReward } from "./defaultRewardModels";

function CreateReward() {
  const { mutate, env } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env: env });

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [reward, setReward] = useState(defaultReward);

  useEffect(() => {
    if (open) {
      setReward(defaultReward);
    }
  }, [open]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      await RewardService.createReward({
        axiosInstance,
        data: reward,
      });

      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create coupon"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add"> Reward</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Reward</DialogTitle>
        </DialogHeader>
        <RewardConfig reward={reward as any} setReward={setReward as any} />
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

export default CreateReward;
