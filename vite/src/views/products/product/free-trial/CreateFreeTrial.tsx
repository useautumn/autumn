import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { useState } from "react";

import { useProductContext } from "../ProductContext";

// import { FrontendFreeTrial } from "@autumn/shared";
import { FreeTrialConfig } from "./FreeTrialConfig";
import { toast } from "sonner";
import { FreeTrialDuration } from "@autumn/shared";

export const CreateFreeTrial = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  // const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<any>(null);
  const { env, product, setProduct, prices } = useProductContext();

  const [freeTrial, setFreeTrial] = useState({
    length: 7,
    unique_fingerprint: false,
    duration: FreeTrialDuration.Day,
  });

  const handleCreateFreeTrial = async () => {
    const lengthInt = parseInt(freeTrial.length as any);
    if (isNaN(lengthInt)) {
      toast.error("Invalid length");
      return;
    }

    setProduct({
      ...product,
      free_trial: {
        length: lengthInt,
        unique_fingerprint: freeTrial.unique_fingerprint,
        duration: freeTrial.duration,
      },
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
