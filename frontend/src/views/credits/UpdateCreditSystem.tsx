import React, { useState } from "react";
import CreditSystemConfig from "./CreditSystemConfig";
import { Feature } from "@autumn/shared";
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
import { useCreditsContext } from "./CreditsContext";

function UpdateCreditSystem({
  open,
  setOpen,
  selectedCreditSystem,
  setSelectedCreditSystem,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedCreditSystem: Feature;
  setSelectedCreditSystem: (creditSystem: Feature) => void;
}) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const { env } = useCreditsContext();
  const axiosInstance = useAxiosInstance({ env });

  const handleUpdateCreditSystem = async () => {
    setUpdateLoading(true);
    try {
      await FeatureService.updateFeature(
        axiosInstance,
        selectedCreditSystem.id,
        {
          ...selectedCreditSystem,
        }
      );
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
