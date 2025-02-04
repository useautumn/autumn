import { Button } from "@/components/ui/button";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { FeatureService } from "@/services/FeatureService";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import toast from "react-hot-toast";
import { FeatureType } from "@autumn/shared";

export default function UpdateFeature({
  open,
  setOpen,
  selectedFeature,
  setSelectedFeature,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedFeature: any;
  setSelectedFeature: (feature: any) => void;
}) {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(true);

  useEffect(() => {
    if (open) {
      setEventNameInput("");
      setEventNameChanged(true);
    }
  }, [open]);

  const updateConfig = () => {
    const config: any = structuredClone(selectedFeature.config);
    if (
      selectedFeature.type === FeatureType.Metered &&
      eventNameInput &&
      config.filters[0].value.length === 0
    ) {
      config.filters[0].value.push(eventNameInput);
    }
    return config;
  };

  const handleUpdateFeature = async () => {
    setUpdateLoading(true);

    try {
      await FeatureService.updateFeature(axiosInstance, selectedFeature.id, {
        ...selectedFeature,
        config: updateConfig(),
      });

      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error("Failed to update feature");
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Update Feature</DialogTitle>

        <FeatureConfig
          feature={selectedFeature}
          setFeature={setSelectedFeature}
          eventNameInput={eventNameInput}
          setEventNameInput={setEventNameInput}
          isUpdate={true}
          eventNameChanged={eventNameChanged}
          setEventNameChanged={setEventNameChanged}
        />

        <DialogFooter>
          <Button
            isLoading={updateLoading}
            onClick={() => handleUpdateFeature()}
            variant="gradientPrimary"
          >
            Update Feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
