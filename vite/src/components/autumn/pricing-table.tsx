import {
  PricingCard,
  PricingTable as PricecnPricingTable,
} from "@/components/pricing/pricing-table";
import { Loader2 } from "lucide-react";

import { useAutumn, usePricingTable } from "autumn-js/react";
import { useEnv } from "@/utils/envUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import ProductChangeDialog from "./product-change-dialog";
import { toast } from "sonner";

export const PricingTable = () => {
  const { attach } = useAutumn();
  const { products, isLoading, error } = usePricingTable();
  const axiosInstance = useAxiosInstance();

  if (isLoading) {
    return (
      <div className="w-full h-full flex justify-center items-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div> Something went wrong...</div>;
  }

  return (
    <div>
      {products && (
        <PricecnPricingTable products={products}>
          {products.map((product) => (
            <PricingCard
              productId={product.id}
              key={product.id}
              buttonProps={{
                onClick: async () => {
                  const { data, error } = await attach({
                    productId: product.id,
                    dialog: ProductChangeDialog,
                  });
                  if (error) {
                    toast.error(error.message);
                  }
                },
              }}
            />
          ))}
        </PricecnPricingTable>
      )}
    </div>
  );
};
