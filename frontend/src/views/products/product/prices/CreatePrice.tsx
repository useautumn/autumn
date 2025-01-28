import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import {
  PricingConfig,
  validateConfig,
  validateFixedConfig,
  validateUsageConfig,
} from "./PricingConfig";
import { CreatePriceSchema, PriceType } from "@autumn/shared";
import { useProductContext } from "../ProductContext";
import { generateId } from "@/utils/genUtils";

export const CreatePrice = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<any>(null);

  const { product, setProduct } = useProductContext();

  const handleCreatePrice = async () => {
    if (!price) {
      return;
    }

    const config = validateConfig(price, product.prices);

    if (!config) {
      return;
    }

    setLoading(true);

    const newPrice = CreatePriceSchema.parse({
      name: price.name,
      config,
    });

    console.log("New price: ", newPrice);

    setProduct({
      ...product,
      prices: [...product.prices, newPrice],
    });
    setOpen(false);
    setPrice(null);
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
          Create Price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create Price</DialogTitle>
        <PricingConfig price={price} setPrice={setPrice} />
        <DialogFooter>
          <Button
            onClick={handleCreatePrice}
            isLoading={loading}
            variant="gradientPrimary"
          >
            Create Price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
