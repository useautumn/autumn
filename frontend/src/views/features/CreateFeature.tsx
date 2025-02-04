import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { FeatureType } from "@autumn/shared";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FeatureService } from "@/services/FeatureService";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import { getBackendErr } from "@/utils/genUtils";

const defaultFeature = {
  type: FeatureType.Boolean,
  config: {},
  name: "",
  id: "",
};
export const CreateFeature = () => {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feature, setFeature] = useState(defaultFeature);
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(false);

  useEffect(() => {
    if (open) {
      setFeature(defaultFeature);
      setEventNameInput("");
      setEventNameChanged(false);
    }
  }, [open]);

  const updateConfig = () => {
    const config: any = structuredClone(feature.config);
    if (
      feature.type === FeatureType.Metered &&
      eventNameInput &&
      config.filters[0].value.length === 0
    ) {
      config.filters[0].value.push(eventNameInput);
    }
    return config;
  };

  const handleCreateFeature = async () => {
    if (!feature.name || !feature.id || !feature.type || !feature.config) {
      toast.error("Please fill out all fields");
      return;
    }

    setLoading(true);
    try {
      await FeatureService.createFeature(axiosInstance, {
        name: feature.name,
        id: feature.id,
        type: feature.type,
        config: updateConfig(),
      });
      mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create feature"));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          startIcon={<PlusIcon size={15} />}
          variant="dashed"
          className="w-full"
        >
          Create Feature
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Feature</DialogTitle>
        </DialogHeader>
        <FeatureConfig
          feature={feature}
          setFeature={setFeature}
          eventNameInput={eventNameInput}
          setEventNameInput={setEventNameInput}
          eventNameChanged={eventNameChanged}
          setEventNameChanged={setEventNameChanged}
        />

        <DialogFooter>
          <Button
            onClick={handleCreateFeature}
            isLoading={loading}
            variant="gradientPrimary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
