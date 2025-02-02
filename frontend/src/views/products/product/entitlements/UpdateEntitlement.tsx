import { Button } from "@/components/ui/button";
import { EntitlementConfig } from "./EntitlementConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProductContext } from "../ProductContext";
import { toast } from "react-hot-toast";

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
  const { setProduct, product } = useProductContext();

  const handleDeleteEntitlement = () => {
    const relatedPrice = product.prices.find((price: any) => {
      return (
        price.config.internal_feature_id ===
        selectedEntitlement.internal_feature_id
      );
    });

    if (relatedPrice) {
      toast.error(
        `Cannot remove entitlement used by price "${relatedPrice.name}"`
      );
      return;
    }

    const updatedEntitlements = product.entitlements.filter(
      (entitlement: any) => {
        return (
          entitlement.internal_feature_id !==
          selectedEntitlement.internal_feature_id
        );
      }
    );

    console.log("Updated entitlements: ", updatedEntitlements);
    setProduct({
      ...product,
      entitlements: updatedEntitlements,
    });

    setOpen(false);
  };

  const handleUpdateEntitlement = () => {
    const updatedEntitlements = product.entitlements.map((entitlement: any) => {
      if (
        entitlement.internal_feature_id ===
        selectedEntitlement.internal_feature_id
      ) {
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
            onClick={handleDeleteEntitlement}
          >
            Delete
          </Button>
          <Button onClick={handleUpdateEntitlement} variant="gradientPrimary">
            Update Entitlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
