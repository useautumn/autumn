import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useState } from "react";
import { useNavigate } from "react-router";
import { PlusIcon } from "lucide-react";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { toast } from "sonner";
import { useEnv } from "@/utils/envUtils";
function CreateCustomer() {
  const env = useEnv();
  const navigate = useNavigate();
  const axiosInstance = useAxiosInstance({ env });
  const [fields, setFields] = useState<{ [key: string]: string }>({
    name: "",
    id: "",
    email: "",
    fingerprint: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    setIsLoading(true);

    try {
      const { data } = await CusService.createCustomer(axiosInstance, {
        ...fields,
        id: fields.id ? fields.id : null,
        fingerprint: fields.fingerprint ? fields.fingerprint : undefined,
      });

      if (data.customer) {
        navigateTo(
          `/customers/${data.customer.id || data.customer.internal_id}`,
          navigate,
          env
        );
      }
      toast.success("Customer created successfully");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create customer"));
    }
    setIsLoading(false);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Customer</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </div>
          <div>
            <FieldLabel>ID</FieldLabel>
            <Input
              value={fields.id}
              onChange={(e) => setFields({ ...fields, id: e.target.value })}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <Input
            value={fields.email}
            onChange={(e) => setFields({ ...fields, email: e.target.value })}
          />
        </div>
        <div>
          <FieldLabel>Fingerprint</FieldLabel>
          <Input
            value={fields.fingerprint}
            onChange={(e) =>
              setFields({ ...fields, fingerprint: e.target.value })
            }
          />
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            isLoading={isLoading}
            variant="gradientPrimary"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCustomer;
