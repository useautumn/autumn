import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProductService } from "@/services/products/ProductService";
import { useRouter } from "next/navigation";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import React, { useState } from "react";
import toast from "react-hot-toast";
import { useProductsContext } from "./ProductsContext";
import { PlusIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getBackendErr, navigateTo } from "@/utils/genUtils";

function CreateProduct() {
  const { env, mutate } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    id: "",
    is_add_on: false,
    is_default: false,
  });

  const [open, setOpen] = useState(false);

  const handleCreateClicked = async () => {
    setLoading(true);
    try {
      const productId = await ProductService.createProduct(axiosInstance, {
        product: fields,
      });

      await mutate();

      navigateTo(`/products/${productId}`, router, env);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create product"));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Product
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[500px]">
        <DialogTitle>Create Product</DialogTitle>
        <div className="flex w-full gap-2">
          <div className="w-full">
            <FieldLabel>Name</FieldLabel>
            <Input
              placeholder="eg. Starter Product"
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </div>
          <div className="w-full">
            <FieldLabel>ID</FieldLabel>
            <Input
              placeholder="eg. Product ID"
              value={fields.id}
              onChange={(e) => setFields({ ...fields, id: e.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 ml-1 text-sm text-t2">
          <Checkbox
            size="sm"
            checked={fields.is_add_on}
            onCheckedChange={(e) => setFields({ ...fields, is_add_on: e })}
          />
          <p className="mt-[1px]">This product is an add on</p>
        </div>
        <div className="flex items-center gap-2 ml-1 text-sm text-t2">
          <Checkbox
            size="sm"
            checked={fields.is_default}
            onCheckedChange={(e) => setFields({ ...fields, is_default: e })}
          />
          <p className="mt-[1px]">This product is the default product</p>
        </div>

        <DialogFooter>
          <Button
            isLoading={loading}
            onClick={handleCreateClicked}
            variant="gradientPrimary"
          >
            Create Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProduct;
