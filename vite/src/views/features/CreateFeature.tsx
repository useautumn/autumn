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
import { toast } from "sonner";
import { Entitlement, Feature, FeatureType } from "@autumn/shared";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FeatureService } from "@/services/FeatureService";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import { getBackendErr } from "@/utils/genUtils";
import { validateFeature } from "./featureUtils";
import { getFeature } from "@/utils/product/entitlementUtils";
import { useEnv } from "@/utils/envUtils";

const defaultFeature = {
  type: FeatureType.Metered,
  config: {
    filters: [
      {
        property: "",
        operator: "",
        value: [],
      },
    ],
  },
  name: "",
  id: "",
};
export const CreateFeature = ({
  isFromEntitlement,
  setShowFeatureCreate,
  setSelectedFeature,
  setOpen,
  open,
}: {
  isFromEntitlement: boolean;
  setShowFeatureCreate: (show: boolean) => void;
  setSelectedFeature: (feature: Feature) => void;
  setOpen: (open: boolean) => void;
  open: boolean;
}) => {
  const { mutate, features } = useFeaturesContext();
  let env = useEnv();

  const axiosInstance = useAxiosInstance({ env });

  const [loading, setLoading] = useState(false);
  const [feature, setFeature] = useState(defaultFeature);
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(true);

  useEffect(() => {
    if (open) {
      setFeatureToDefault();
    }
  }, [open]);

  const setFeatureToDefault = () => {
    setFeature({
      type: FeatureType.Metered,
      config: {
        filters: [
          {
            property: "",
            operator: "",
            value: [],
          },
        ],
      },
      name: "",
      id: "",
    });
    // setEventNameInput("");
    // setEventNameChanged(false);
  };

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
    if (!validateFeature(feature)) {
      return;
    }

    setLoading(true);
    try {
      let { data: createdFeature } = await FeatureService.createFeature(
        axiosInstance,
        {
          name: feature.name,
          id: feature.id,
          type: feature.type,
          config: updateConfig(),
        }
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
