import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

import { DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProductService } from "@/services/products/ProductService";
import { toast } from "sonner";
import React, { useState } from "react";
import { AppEnv } from "@autumn/shared";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { Product } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Select } from "@/components/ui/select";
import { useProductsContext } from "../ProductsContext";

export const CopyDialog = ({
  product,
  setModalOpen,
}: {
  product: Product;
  setModalOpen: (open: boolean) => void;
}) => {
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });
  const { mutate: productsMutate } = useProductsContext();

  const [copyLoading, setCopyLoading] = useState(false);
  const [name, setName] = useState(product.name);
  const [id, setId] = useState(product.id);
  const [toEnv, setToEnv] = useState<AppEnv>(
    env == AppEnv.Live ? AppEnv.Sandbox : AppEnv.Live,
  );

  const handleCopy = async () => {
    // 1. If env is the same and id is same, throw error

    if (env == toEnv && id == product.id) {
      toast.error("Product ID already exists");
      return;
    }

    setCopyLoading(true);
    try {
      await ProductService.copyProduct(axiosInstance, product.id, {
        id: id,
        name: name,
        env: toEnv,
      });
      await productsMutate();

      toast.success("Successfully copied product");
      setModalOpen(false);
    } catch (error) {
      console.log("Error copying product", error);
      toast.error(getBackendErr(error, "Failed to copy product"));
    }
    setCopyLoading(false);
  };
  return (
    <React.Fragment>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogTitle>Copy Product</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex gap-2 w-full">
            <div className="w-full">
              <FieldLabel>Name</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="w-full">
              <FieldLabel>ID</FieldLabel>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div>
            <FieldLabel>Environment</FieldLabel>
            <Select
              value={toEnv}
              onValueChange={(value) => setToEnv(value as AppEnv)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AppEnv.Live}>Live</SelectItem>
                <SelectItem value={AppEnv.Sandbox}>Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="gradientPrimary"
            onClick={handleCopy}
            isLoading={copyLoading}
          >
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </React.Fragment>
  );
};
