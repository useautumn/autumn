import React, { useState } from "react";
import CreditSystemConfig from "./CreditSystemConfig";
import { CreateFeature } from "@autumn/shared";
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
import { useFeaturesContext } from "../features/FeaturesContext";
import { validateCreditSystem } from "./CreateCreditSystem";

function UpdateCreditSystem({
  open,
  setOpen,
  selectedCreditSystem,
  setSelectedCreditSystem,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedCreditSystem: CreateFeature;
  setSelectedCreditSystem: (creditSystem: CreateFeature) => void;
}) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });

  const handleUpdateCreditSystem = async () => {
    const validationError = validateCreditSystem(selectedCreditSystem);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUpdateLoading(true);
    try {
      await FeatureService.updateFeature(
        axiosInstance,
        selectedCreditSystem.id,
        {
          ...selectedCreditSystem,
        },
      );
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error("Failed to update credit system");
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Update Credit System</DialogTitle>

        <CreditSystemConfig
          creditSystem={selectedCreditSystem}
          setCreditSystem={setSelectedCreditSystem}
        />

        <DialogFooter>
          <Button
            isLoading={updateLoading}
            onClick={() => handleUpdateCreditSystem()}
            variant="gradientPrimary"
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateCreditSystem;
