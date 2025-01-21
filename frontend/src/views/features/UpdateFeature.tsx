import { Button } from "@/components/ui/button";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { FeatureService } from "@/services/FeatureService";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import toast from "react-hot-toast";

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

  const handleDeleteFeature = () => {
    console.log("Delete Feature");
  };

  const handleUpdateFeature = async () => {
    setUpdateLoading(true);
    try {
      await FeatureService.updateFeature(
        axiosInstance,
        selectedFeature.id,
        selectedFeature
      );

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
        />

        <DialogFooter>
          <Button variant="destructive" className="text-xs" onClick={() => handleDeleteFeature()}>
            Delete
          </Button>
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
