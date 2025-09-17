import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import { FeatureService } from "@/services/FeatureService";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { FeatureType } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import {
  CustomDialogBody,
  CustomDialogContent,
  CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { CircleArrowUp, Save } from "lucide-react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureConfig } from "@/views/products/features/components/FeatureConfig";

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
  const { refetch } = useFeaturesQuery();
  const axiosInstance = useAxiosInstance();
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

      await refetch();
      setOpen(false);
    } catch (error) {
      console.log(error);
      toast.error(getBackendErr(error, "Failed to update feature"));
    }
    setUpdateLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CustomDialogContent>
        <CustomDialogBody>
          <DialogTitle>Update Feature</DialogTitle>

          <FeatureConfig
            feature={selectedFeature}
            setFeature={setSelectedFeature}
            eventNameInput={eventNameInput}
            setEventNameInput={setEventNameInput}
            isUpdate={true}
            eventNameChanged={eventNameChanged}
            setEventNameChanged={setEventNameChanged}
            open={open}
          />
        </CustomDialogBody>
        <CustomDialogFooter>
          <Button
            isLoading={updateLoading}
            onClick={() => handleUpdateFeature()}
            variant="add"
            startIcon={<CircleArrowUp size={14} />}
          >
            Update Feature
          </Button>
        </CustomDialogFooter>
      </CustomDialogContent>
    </Dialog>
  );
}
