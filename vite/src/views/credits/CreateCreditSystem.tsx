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
import { useEffect, useState } from "react";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Feature, FeatureType } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import CreditSystemConfig from "./CreditSystemConfig";
import { useFeaturesContext } from "../features/FeaturesContext";
const defaultCreditSystem = {
  name: "",
  id: "",
  type: FeatureType.CreditSystem,
  config: {
    schema: [{ metered_feature_id: "", feature_amount: 1, credit_amount: 0 }],
  },
};

export const validateCreditSystem = (creditSystem: Feature): string | null => {
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
    useState<Feature>(defaultCreditSystem);

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
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Credit System
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Credit System</DialogTitle>
        </DialogHeader>
        <CreditSystemConfig
          creditSystem={creditSystem}
          setCreditSystem={setCreditSystem}
        />

        {/* <div className="flex flex-col gap-4">
          <div className="flex gap-4 w-full">
            <div className="w-full">
              <FieldLabel>Name</FieldLabel>
              <Input
                placeholder="Name"
                value={fields.name}
                onChange={(e) => {
                  const newFields: any = { ...fields, name: e.target.value };
                  if (!idChanged) {
                    newFields.id = slugify(e.target.value);
                  }
                  setFields(newFields);
                }}
              />
            </div>
            <div className="w-full">
              <FieldLabel>ID</FieldLabel>
              <Input
                placeholder="ID"
                value={fields.id}
                onChange={(e) => {
                  setFields({ ...fields, id: e.target.value });
                  setIdChanged(true);
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Schema</FieldLabel>

            <div className="grid grid-cols-10 gap-2 gap-y-1 mb-4">
              <FieldLabel className="!mb-0 col-span-3">Meter</FieldLabel>
              <FieldLabel className="!mb-0 col-span-3">
                Metered Amount
              </FieldLabel>
              <FieldLabel className="!mb-0 col-span-3">
                Credit Amount
              </FieldLabel>
              <p className="col-span-1"></p>

              {creditSystemConfig.schema.map((item, index) => (
                <React.Fragment key={index}>
                  <Select
                    onValueChange={(value) => {
                      handleSchemaChange(index, "metered_feature_id", value);
                    }}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="eg. API Calls" />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        ?.filter(
                          (feature: Feature) =>
                            feature.type === FeatureType.Metered
                        )
                        .map((feature: Feature) => (
                          <SelectItem key={feature.id} value={feature.id!}>
                            {feature.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Input
                    className="col-span-3"
                    type="number"
                    value={item.feature_amount}
                    onChange={(e) =>
                      handleSchemaChange(
                        index,
                        "feature_amount",
                        e.target.value
                      )
                    }
                  />
                  <Input
                    className="col-span-3"
                    type="number"
                    value={item.credit_amount}
                    onChange={(e) =>
                      handleSchemaChange(index, "credit_amount", e.target.value)
                    }
                  />
                  <div className="col-span-1 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => removeSchemaItem(index)}
                      isIcon
                      dim={6}
                      className="text-t3"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </Button>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <Button variant="secondary" onClick={addSchemaItem}>
              Add
            </Button>
          </div>
        </div> */}
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
