import { Button } from "@/components/ui/button";
import { EntitlementConfig } from "./EntitlementConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProductContext } from "../ProductContext";

export default function UpdateEntitlement({
  open,
  setOpen,
  selectedEntitlement,
  setSelectedEntitlement,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedEntitlement: any;
  setSelectedEntitlement: (entitlement: any) => void;
}) {
  const { entitlements, setProduct, product } = useProductContext();

  const handleDeleteFeature = () => {
    const updatedEntitlements = entitlements.filter((entitlement: any) => {
      return entitlement.id !== selectedEntitlement.id;
    });
    setProduct({ ...product, entitlements: updatedEntitlements });
    setOpen(false);
  };

  const handleUpdateFeature = () => {
    const updatedEntitlements = entitlements.map((entitlement: any) => {
      if (entitlement.id === selectedEntitlement.id) {
        return {
          ...entitlement,
          ...selectedEntitlement,
        };
      }
      return entitlement;
    });
    setProduct({ ...product, entitlements: updatedEntitlements });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Update Entitlement</DialogTitle>

        <EntitlementConfig
          entitlement={selectedEntitlement}
          setEntitlement={setSelectedEntitlement}
          isUpdate={true}
        />

        <DialogFooter>
          <Button
            variant="destructive"
            className="text-xs"
            onClick={() => handleDeleteFeature()}
          >
            Delete
          </Button>
          <Button
            onClick={() => handleUpdateFeature()}
            variant="gradientPrimary"
          >
            Update Entitlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
