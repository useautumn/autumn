import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreateFeature as CreateFeatureType,
  FeatureType,
  FeatureUsageType,
} from "@autumn/shared";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FeatureService } from "@/services/FeatureService";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import { getBackendErr } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";

export const CreateFeature = ({
  isFromEntitlement,
  setShowFeatureCreate,
  setSelectedFeature,
  setOpen,
  open,
  entityCreate,
}: {
  isFromEntitlement: boolean;
  setShowFeatureCreate: (show: boolean) => void;
  setSelectedFeature: (feature: CreateFeatureType) => void;
  setOpen: (open: boolean) => void;
  open: boolean;
  entityCreate?: boolean;
}) => {
  const { mutate, features } = useFeaturesContext();
  const env = useEnv();
  const defaultFeature: CreateFeatureType = {
    type: FeatureType.Metered,
    config: {
      filters: [
        {
          property: "",
          operator: "",
          value: [],
        },
      ],
      usage_type: entityCreate
        ? FeatureUsageType.Continuous
        : FeatureUsageType.Single,
    },
    name: "",
    id: "",
  };

  const axiosInstance = useAxiosInstance({ env });

  const [loading, setLoading] = useState(false);
  const [feature, setFeature] = useState(defaultFeature);
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(true);

  useEffect(() => {
    if (open) {
      setFeature(defaultFeature);
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

    feature.config = updateConfig();

    setLoading(true);
    try {
      const { data: createdFeature } = await FeatureService.createFeature(
        axiosInstance,
        {
          name: feature.name,
          id: feature.id,
          type: feature.type,
          config: updateConfig(),
        },
      );

      if (isFromEntitlement) {
        if (createdFeature) {
          setSelectedFeature(createdFeature);
        }
        setShowFeatureCreate(false);
      } else {
        await mutate();
        setOpen(false);
      }
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create feature"));
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
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
          className="w-fit"
          variant="gradientPrimary"
        >
          Create Feature
        </Button>
      </DialogFooter>
    </div>
  );
};

export const CreateFeatureDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add">Feature</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Feature</DialogTitle>
        </DialogHeader>
        <CreateFeature
          isFromEntitlement={false}
          setShowFeatureCreate={() => {}}
          setSelectedFeature={() => {}}
          setOpen={setOpen}
          open={open}
        />
      </DialogContent>
    </Dialog>
  );
};
