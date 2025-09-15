import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogTitle } from "@/components/ui/dialog";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreateFeature as CreateFeatureType,
  FeatureType,
} from "@autumn/shared";
import { useFeaturesContext } from "./FeaturesContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { FeatureService } from "@/services/FeatureService";
import { FeatureConfig } from "./metered-features/FeatureConfig";
import { getBackendErr } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";
import { getDefaultFeature } from "./utils/defaultFeature";
import {
  CustomDialogBody,
  CustomDialogContent,
} from "@/components/general/modal-components/DialogContentWrapper";
import { CreateFeatureFooter } from "./components/CreateFeatureFooter";

export const CreateFeature = ({
  // isFromEntitlement,
  // setShowFeatureCreate,
  onSuccess,
  setOpen,
  open,
  entityCreate,
  handleBack,
}: {
  // isFromEntitlement: boolean;
  // setShowFeatureCreate: (show: boolean) => void;
  onSuccess?: (newFeature: CreateFeatureType) => Promise<void>;
  setOpen: (open: boolean) => void;
  open: boolean;
  entityCreate?: boolean;
  handleBack?: () => void;
}) => {
  const env = useEnv();

  const axiosInstance = useAxiosInstance({ env });
  const { mutate, features } = useFeaturesContext();
  const [feature, setFeature] = useState(getDefaultFeature(entityCreate));
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(true);

  useEffect(() => {
    if (open) {
      setFeature(getDefaultFeature(entityCreate));
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
    if (!feature.name || !feature.id || !feature.type) {
      toast.error("Please fill out all fields");
      return;
    }

    feature.config = updateConfig();

    try {
      const { data: createdFeature } = await FeatureService.createFeature(
        axiosInstance,
        {
          name: feature.name,
          id: feature.id,
          type: feature.type,
          config: updateConfig(),
        }
      );

      if (onSuccess) {
        await onSuccess(createdFeature);
      } else {
        await mutate();
        setOpen(false);
      }

      // if (isFromEntitlement) {
      //   if (createdFeature) {
      //     setSelectedFeature(createdFeature);
      //   }
      //   setShowFeatureCreate(false);
      // } else {
      //   await mutate();
      //   setOpen(false);
      // }
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create feature"));
    }
  };

  return (
    <>
      <CustomDialogBody className="w-[90%]">
        <DialogHeader>
          <DialogTitle>Create Feature</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FeatureConfig
            feature={feature}
            setFeature={setFeature}
            eventNameInput={eventNameInput}
            setEventNameInput={setEventNameInput}
            eventNameChanged={eventNameChanged}
            setEventNameChanged={setEventNameChanged}
            open={open}
          />
        </div>
      </CustomDialogBody>
      <CreateFeatureFooter
        handleCreate={handleCreateFeature}
        handleBack={handleBack}
      />
    </>
  );
};

export const CreateFeatureDialog = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="add" className="w-full">
          Feature
        </Button>
      </DialogTrigger>
      <CustomDialogContent>
        <CreateFeature setOpen={setOpen} open={open} />
      </CustomDialogContent>
    </Dialog>
  );
};

// <DialogContent className="w-[500px]">
//         <DialogHeader>
//           <DialogTitle>Create Feature</DialogTitle>
//         </DialogHeader>
//         {/* <CreateFeature
//           isFromEntitlement={false}
//           setShowFeatureCreate={() => {}}
//           setSelectedFeature={() => {}}
//           setOpen={setOpen}
//           open={open}
//         /> */}
//       </DialogContent>
{
  /* <DialogFooter>
        <Button
          onClick={handleCreateFeature}
          isLoading={loading}
          className="w-fit"
          variant="gradientPrimary"
        >
          Create Feature
        </Button>
      </DialogFooter> */
}
