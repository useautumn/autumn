import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import toast from "react-hot-toast";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { FeatureType, AppEnv } from "@autumn/shared";

function CreateBooleanFeature() {
  const axiosInstance = useAxiosInstance({ env: AppEnv.Sandbox, isAuth: true });

  const [fields, setFields] = useState({
    name: "",
    id: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [idChanged, setIdChanged] = useState(false);

  useEffect(() => {
    setFields({
      name: "",
      id: "",
    });
    setIdChanged(false);
  }, []);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await FeatureService.createFeature(axiosInstance, {
        name: fields.name,
        id: fields.id,
        type: FeatureType.Boolean,
      });
    } catch (error) {
      toast.error("Failed to create boolean feature");
    }
    setIsLoading(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create Boolean Feature</Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Boolean Feature</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
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
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} isLoading={isLoading}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateBooleanFeature;
