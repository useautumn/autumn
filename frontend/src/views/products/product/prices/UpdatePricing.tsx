import { Button } from "@/components/ui/button";
import {
  PricingConfig,
  validateFixedConfig,
  validateUsageConfig,
} from "./PricingConfig";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProductContext } from "../ProductContext";
import { PriceType } from "@autumn/shared";
import toast from "react-hot-toast";

export default function UpdatePricing({
  open,
  setOpen,
  selectedPrice,
  setSelectedPrice,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedPrice: any;
  setSelectedPrice: (price: any) => void;
}) {
  const { product, setProduct, prices } = useProductContext();

  const handleDeletePricing = () => {
    const updatedPrices = prices.filter((price: any) => {
      return price.id !== selectedPrice.id;
    });
    setProduct({ ...product, prices: updatedPrices });
    setOpen(false);
  };

  const handleUpdatePricing = () => {
    let config: any;
    if (selectedPrice.config.type === PriceType.Fixed) {
      config = validateFixedConfig(selectedPrice.config, prices);
    } else if (selectedPrice.config.type === PriceType.Usage) {
      config = validateUsageConfig(selectedPrice.config);
    }

    if (!config) {
      toast.error("Invalid pricing configuration");
      return;
    }

    const updatedPrices = prices.map((price: any) => {
      if (price.id === selectedPrice.id) {
        return {
          ...price,
          ...selectedPrice,
          config: config,
        };
      }
      return price;
    });

    setProduct({ ...product, prices: updatedPrices });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Update Price</DialogTitle>

        <PricingConfig
          price={{
            priceType: selectedPrice?.type,
            config: selectedPrice?.config,
            name: selectedPrice?.name,
            id: selectedPrice?.id,
          }}
          setPrice={setSelectedPrice}
        />

        <DialogFooter>
          <Button variant="destructive" className="text-xs" onClick={() => handleDeletePricing()}>
            Delete
          </Button>
          <Button onClick={() => handleUpdatePricing()} variant="gradientPrimary">Update Price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
