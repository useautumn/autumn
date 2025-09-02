import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogFooter,
  DialogContent,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router";
import { EntityConfig } from "./EntityConfig";
import { getBackendErr } from "@/utils/genUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useCustomerContext } from "../../../CustomerContext";
import { useCusQuery } from "../../../hooks/useCusQuery";

export const CreateEntity = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const cusContext = useCustomerContext();
  const { customer, refetch } = useCusQuery();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [entity, setEntity] = useState<any>({
    id: "",
    name: "",
  });

  const axiosInstance = useAxiosInstance();

  if (!cusContext) return null;

  // const { customer, cusMutate } = cusContext;

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

      await refetch();
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
