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
  validateFixedConfig,
  validateUsageConfig,
} from "./PricingConfig";
import { PriceType } from "@autumn/shared";
import { useProductContext } from "../ProductContext";

export const CreatePrice = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<any>(null);
  const { env, product, setProduct, prices } = useProductContext();

  // const axiosInstance = useAxiosInstance({ env });

  const handleCreatePrice = async () => {
    let config: any = null;

    if (!price) {
      return;
    }

    if (price.config.type == PriceType.Usage) {
      config = validateUsageConfig(price?.config);
    } else if (price.config.type == PriceType.Fixed) {
      config = validateFixedConfig(price?.config, prices);
    }

    if (!config) {
      return;
    }

    setLoading(true);
    const newPrice = {
      ...price,
      config,
      // created_at: Date.now(),
      // id: product.prices.length,
    };

    setProduct({
      ...product,
      prices: [...product.prices, newPrice],
    });
    setOpen(false);
    setPrice(null);
    setLoading(false);
  };

  //   //   if (!product) {
  //   //   try {
  //   //     await PriceService.createPrice(axiosInstance, {
  //   //       product_id: product.id,
  //   //       config: { ...config, type: price.priceType },
  //   //       name: price.name,
  //   //     });
  //   //     await mutate();
  //   //   } catch (error) {
  //   //     console.log(error);
  //   //     toast.error("Failed to create price");
  //   //   }
  //   // }
  //   setOpen(false);
  //   setPrice({
  //     priceType: PriceType.Fixed,
  //     config: {},
  //     name: "",
  //   });
  //   setLoading(false);
  // };

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
          <Button onClick={handleCreatePrice} isLoading={loading} variant="gradientPrimary">
            Create Price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
