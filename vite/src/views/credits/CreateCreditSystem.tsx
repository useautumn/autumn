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
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";

import {
  CreateFeature,
  Feature,
  FeatureType,
  FeatureUsageType,
} from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import CreditSystemConfig from "./CreditSystemConfig";
import { useFeaturesContext } from "../features/FeaturesContext";
const defaultCreditSystem = {
  name: "",
  id: "",
  type: FeatureType.CreditSystem,
  config: {
    schema: [{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 }],
    usage_type: FeatureUsageType.Single,
  },
};

export const validateCreditSystem = (
  creditSystem: CreateFeature,
): string | null => {
  if (!creditSystem.id || !creditSystem.name) {
    return "Please fill in all fields";
  }

  if (creditSystem.config.schema.length === 0) {
    return "Need at least one metered feature";
  }

  for (const item of creditSystem.config.schema) {
    if (!item.metered_feature_id) {
      return "Select a metered feature";
    }

    if (item.feature_amount <= 0 || item.credit_amount <= 0) {
      return "Credit amount must be greater than 0";
    }
  }

  return null;
};

function CreateCreditSystem() {
  const { mutate, env } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env: env });

  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const [creditSystem, setCreditSystem] =
    useState<CreateFeature>(defaultCreditSystem);

  useEffect(() => {
    if (open) {
      setCreditSystem(defaultCreditSystem);
    }
  }, [open]);

  const handleCreateCreditSystem = async () => {
    const validationError = validateCreditSystem(creditSystem);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await FeatureService.createFeature(axiosInstance, {
        name: creditSystem.name,
        id: creditSystem.id,
        type: FeatureType.CreditSystem,
        config: creditSystem.config,
      });
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create credit system"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add">Credit System</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px] overflow-y-auto max-h-[500px]">
        <DialogHeader>
          <DialogTitle>Create Credit System</DialogTitle>
        </DialogHeader>
        <CreditSystemConfig
          creditSystem={creditSystem}
          setCreditSystem={setCreditSystem}
        />

        <DialogFooter>
          <Button
            onClick={handleCreateCreditSystem}
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

export default CreateCreditSystem;
