import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullCusProduct } from "@autumn/shared";

import { useEffect, useState } from "react";
import { useCustomerContext } from "../CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

export const TransferProductDialog = ({
  cusProduct,
  open,
  setOpen,
}: {
  cusProduct: FullCusProduct;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { entities, cusMutate } = useCustomerContext();
  const axiosInstance = useAxiosInstance();
  const [loading, setLoading] = useState(false);
  const filteredEntities = entities.filter(
    (entity: any) => entity.internal_id !== cusProduct.internal_entity_id
  );
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setSelectedEntity(null);
    }
  }, [open]);

  const handleClicked = async () => {
    if (!selectedEntity) {
      toast.error("Please select an entity to transfer the product to");
      return;
    }

    setLoading(true);

    try {
      const fromEntity = entities.find(
        (e: any) => e.internal_id === cusProduct.internal_entity_id
      );
      await axiosInstance.post(
        `/v1/customers/${cusProduct.customer_id}/transfer`,
        {
          // internal_entity_id: selectedEntity.internal_id,
          from_entity_id: fromEntity?.id,
          to_entity_id: selectedEntity.id,
          product_id: cusProduct.product_id,
          // customer_product_id: cusProduct.id,
        }
      );
      await cusMutate();
      toast.success("Product transferred successfully");
      setOpen(false);
    } catch (error) {
      console.log(error);
      toast.error(getBackendErr(error, "Failed to transfer product"));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Transfer Product</DialogTitle>
        </DialogHeader>
        <div className="">
          <p className="text-sm text-t2">
            Select another entity to transfer this product to.
          </p>
        </div>
        <Select
          value={selectedEntity?.id}
          onValueChange={(value) => {
            setSelectedEntity(entities.find((e: any) => e.id === value));
          }}
          disabled={filteredEntities.length == 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                filteredEntities.length == 0
                  ? "No other entities to transfer to"
                  : "Select an entity"
              }
            />
          </SelectTrigger>
          <SelectContent className="w-full">
            {filteredEntities.length > 0 ? (
              filteredEntities.map((entity: any) => (
                <SelectItem
                  key={entity.id}
                  value={entity.id}
                  className="w-full"
                >
                  <p className="w-full truncate">
                    {entity.name || entity.internal_id}{" "}
                    {entity.id && (
                      <span className="text-t3">({entity.id})</span>
                    )}
                  </p>
                </SelectItem>
              ))
            ) : (
              <SelectItem value="no-entities">
                No other entities. Please create an entity first.
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <DialogFooter>
          <div className="flex gap-2">
            <Button onClick={handleClicked} isLoading={loading}>
              Transfer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
