import { Button } from "@/components/ui/button";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { FeatureService } from "@/services/FeatureService";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { FeatureType } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";

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

  const originalFeature = useRef(selectedFeature);

  useEffect(() => {
    if (open) {
      originalFeature.current = selectedFeature;
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setEventNameInput("");
      setEventNameChanged(true);
    }
  }, [open, selectedFeature]);

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
    const originalId = originalFeature.current.id;

    try {
      await FeatureService.updateFeature(axiosInstance, originalId, {
        ...selectedFeature,
        id: selectedFeature.id,
        type: selectedFeature.type,
        name: selectedFeature.name,
        config: updateConfig(),
      });

      await mutate();
      setOpen(false);
    } catch (error) {
      console.log(error);
      toast.error(getBackendErr(error, "Failed to update feature"));
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
