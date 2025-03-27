import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useProductContext } from "../ProductContext";
import { EntitlementConfig } from "./EntitlementConfig";
import { CreateEntitlementSchema, Entitlement } from "@autumn/shared";

export const CreateEntitlement = () => {
  const [open, setOpen] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const { product, setProduct } = useProductContext();

  const handleCreateEntitlement = async () => {
    const newEntitlement = CreateEntitlementSchema.parse(entitlement);
    console.log("New entitlement", newEntitlement);

    setProduct({
      ...product,
      entitlements: [...product.entitlements, newEntitlement],
    });

    setOpen(false);
    setEntitlement(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          startIcon={<PlusIcon size={15} />}
          variant="dashed"
          className="w-full"
        >
          Create Entitlement
        </Button>
      </DialogTrigger>
      <DialogContent className="">
        <DialogHeader>
          <DialogTitle>Create Entitlement</DialogTitle>
        </DialogHeader>
        <div className="flex w-full overflow-hidden">
          <EntitlementConfig
            entitlement={entitlement}
            setEntitlement={setEntitlement}
          />
        </div>

        <DialogFooter>
          <Button onClick={handleCreateEntitlement} variant="gradientPrimary">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
