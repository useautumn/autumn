import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogFooter,
  DialogContent,
} from "@/components/ui/dialog";
import { useCustomerContext } from "../../CustomerContext";
import { useState } from "react";
import { EntityConfig } from "./entity-config";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";
import { useNavigate } from "react-router";
export const CreateEntity = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const cusContext = useCustomerContext();
  const navigate = useNavigate();

  if (!cusContext) {
    return null;
  }

  const { customer, cusMutate } = cusContext;
  const [isLoading, setIsLoading] = useState(false);
  const [entity, setEntity] = useState<any>({
    id: "",
    name: "",
  });

  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const handleCreateClicked = async () => {
    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post(
        `/v1/customers/${
          customer.id || customer.internal_id
        }/entities?with_autumn_id=true`,
        {
          id: entity.id || null,
          name: entity.name || null,
          feature_id: entity.feature_id,
          customer_id: customer.id,
        }
      );

      await cusMutate();
      setOpen(false);

      const params = new URLSearchParams(location.search);
      params.set("entity_id", data.id || data.autumn_id);
      navigate(`${location.pathname}?${params.toString()}`);

      toast.success("Entity created successfully");
    } catch (error) {
      console.log(error);
      toast.error(getBackendErr(error, "Failed to create entity"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild></DialogTrigger>
      <DialogContent className="w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Entity</DialogTitle>
        </DialogHeader>
        <EntityConfig entity={entity} setEntity={setEntity} />

        <DialogFooter>
          <Button
            onClick={handleCreateClicked}
            isLoading={isLoading}
            variant="gradientPrimary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
