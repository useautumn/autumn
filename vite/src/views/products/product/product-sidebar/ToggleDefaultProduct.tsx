import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { ToggleButton } from "@/components/general/ToggleButton";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductContext } from "../ProductContext";
import { toast } from "sonner";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { isFreeProductV2 } from "@autumn/shared";

const ToggleProductDialog = ({
  open,
  setOpen,
  description,
  toggleKey,
  value,
  toggleProduct,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  description: string;
  toggleKey: "is_default" | "is_add_on";
  value: boolean;
  toggleProduct: (value: boolean, optimisticUpdate?: boolean) => Promise<void>;
}) => {
  const { product, customer } = useProductContext();
  const [loading, setLoading] = useState(false);
  const handleConfirm = async () => {
    setLoading(true);
    try {
      await toggleProduct(value, false);
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
    setLoading(false);
  };

  const getTitle = () => {
    if (toggleKey === "is_default") {
      return value
        ? `Make ${product.name} a default product`
        : `Remove default from ${product.name}`;
    } else {
      return value
        ? `Make ${product.name} an add-on`
        : `Remove ${product.name} as an add-on`;
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          <p>{description}</p>
        </DialogDescription>
        <DialogFooter>
          <Button
            variant="secondary"
            isLoading={loading}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ToggleDefaultProduct = ({
  toggleKey,
}: {
  toggleKey: "is_default" | "is_add_on";
}) => {
  const axiosInstance = useAxiosInstance();
  const { product, setProduct, counts, mutate, customer, groupDefaults } =
    useProductContext();

  const activeCount = counts?.active;
  const [open, setOpen] = useState(false);
  const [dialogDescription, setDialogDescription] = useState("");
  const [toggling, setToggling] = useState(false);

  const toggleProduct = async (value: boolean, optimisticUpdate = true) => {
    setToggling(true);

    if (toggling) {
      return;
    }

    try {
      if (optimisticUpdate) {
        setProduct({
          ...product,
          [toggleKey]: value,
        });
      }

      const data = {
        [toggleKey]: value,
        free_trial: toggleKey === "is_default" ? product.free_trial : undefined,
      };

      await ProductService.updateProduct(axiosInstance, product.id, data);
      // mutate();
      setOpen(false);
      toast.success("Successfully updated product");
    } catch (error) {
      setProduct({
        ...product,
        [toggleKey]: !value,
      });

      toast.error(getBackendErr(error, "Failed to update product"));
    } finally {
      setToggling(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (toggling) return;

    const disableDefaultDescription = getDisableDefaultDescription(value);
    if (disableDefaultDescription) {
      setDialogDescription(disableDefaultDescription);
      setOpen(true);
      return;
    }

    if (activeCount > 0) {
      const activeCusStr = activeCount === 1 ? "customer" : "customers";
      // 1. If key is default
      if (toggleKey === "is_default") {
        if (value) {
          setDialogDescription(
            `You have ${activeCount} active ${activeCusStr} on this product. Are you sure you want to make this product default?`
          );
        } else {
          setDialogDescription(
            `You have ${activeCount} active ${activeCusStr} on this product. Are you sure you want to remove this product as default?`
          );
        }
      } else {
        if (value) {
          setDialogDescription(
            `You have ${activeCount} active ${activeCusStr} on this product. Are you sure you want to make this product an add-on?`
          );
        } else {
          setDialogDescription(
            `You have ${activeCount} active ${activeCusStr} on this product. Are you sure you want to remove this product as an add-on?`
          );
        }
      }
      setOpen(true);
    } else {
      await toggleProduct(value);
    }
  };

  const getDisableDefaultDescription = (value: boolean) => {
    // 1. Is default trial
    if (toggleKey !== "is_default") return;

    const isDefaultTrial =
      value && product.free_trial && !isFreeProductV2(product);

    if (isDefaultTrial && notNullish(groupDefaults?.defaultTrial)) {
      return `${groupDefaults.defaultTrial.name} is currently a default trial product. Making ${product.name} a default trial will remove ${groupDefaults.defaultTrial.name} as a default trial product.`;
    }

    if (value && notNullish(groupDefaults?.free)) {
      return `${groupDefaults.free.name} is currently a default product. Making ${product.name} a default product will remove ${groupDefaults.free.name} as a default product.`;
    }
  };

  const isDisabled =
    (toggleKey === "is_add_on" && product.is_default) ||
    (toggleKey === "is_default" && product.is_add_on);

  return (
    <>
      <ToggleProductDialog
        open={open}
        setOpen={setOpen}
        description={dialogDescription}
        toggleKey={toggleKey}
        value={!product[toggleKey]}
        toggleProduct={toggleProduct}
      />
      <ToggleButton
        value={product[toggleKey]}
        setValue={handleToggle}
        className="text-t2 px-2"
        disabled={isDisabled || notNullish(customer)}
      />
    </>
  );
};
