import { Button } from "@/components/ui/button";
import {
  PricingConfig,
  validateConfig,
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
  selectedIndex,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  selectedPrice: any;
  setSelectedPrice: (price: any) => void;
  selectedIndex: number;
}) {
  const { product, setProduct } = useProductContext();

  const handleDeletePricing = () => {
    const updatedPrices = product.prices.filter((price: any, index: number) => {
      return index !== selectedIndex;
    });

    setProduct({ ...product, prices: updatedPrices });
    setOpen(false);
  };

  const handleUpdatePricing = () => {
    const config = validateConfig(selectedPrice, product.prices);

    if (!config) {
      return;
    }

    const updatedPrices = product.prices.map((price: any, index: number) => {
      if (index === selectedIndex) {
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
          // price={{
          //   priceType: selectedPrice?.type,
          //   config: selectedPrice?.config,
          //   name: selectedPrice?.name,
          //   id: selectedPrice?.id,
          // }}
          price={selectedPrice}
          setPrice={setSelectedPrice}
          isUpdate={true}
        />

        <DialogFooter>
          <Button variant="destructive" onClick={() => handleDeletePricing()}>
            Delete
          </Button>
          <Button
            onClick={() => handleUpdatePricing()}
            variant="gradientPrimary"
          >
            Update Price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
