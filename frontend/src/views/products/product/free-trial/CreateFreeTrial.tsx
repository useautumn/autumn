import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { useProductContext } from "../ProductContext";

import { FreeTrialDuration, FrontendFreeTrial } from "@autumn/shared";
import { FreeTrialConfig } from "./FreeTrialConfig";
import { toast } from "react-hot-toast";

export const CreateFreeTrial = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<any>(null);
  const { env, product, setProduct, prices } = useProductContext();

  const [freeTrial, setFreeTrial] = useState<FrontendFreeTrial>({
    length: 7,
    unique_fingerprint: false,
  });

  const handleCreateFreeTrial = async () => {
    const lengthInt = parseInt(freeTrial.length as string);
    if (isNaN(lengthInt)) {
      toast.error("Invalid length");
      return;
    }

    setProduct({
      ...product,
      free_trial: {
        length: lengthInt,
        unique_fingerprint: freeTrial.unique_fingerprint,
      },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Free Trial
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create Free Trial</DialogTitle>

        <FreeTrialConfig freeTrial={freeTrial} setFreeTrial={setFreeTrial} />

        <DialogFooter>
          <Button
            onClick={handleCreateFreeTrial}
            isLoading={loading}
            variant="gradientPrimary"
          >
            Create Free Trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
