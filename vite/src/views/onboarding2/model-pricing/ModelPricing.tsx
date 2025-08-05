import PricingTable from "@/components/autumn/pricing-table";
import { EditProduct } from "./EditProduct";
import { useEffect, useState } from "react";

import { getBackendErr, nullish } from "@/utils/genUtils";
import { Feature, Product } from "autumn-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, PlusIcon } from "lucide-react";
import {
  ModelPricingContext,
  useModelPricingContext,
} from "./ModelPricingContext";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { ProductsContext } from "@/views/products/ProductsContext";
import { SelectEditProduct } from "./SelectEditProduct";
import { ConnectStripeStep } from "./ConnectStripe";
import { AutumnProvider } from "autumn-js/react";
import { useProductData } from "@/views/products/product/hooks/useProductData";

const defaultProduct = {
  id: "free_plan",
  name: "Free Plan",
  items: [],
  is_default: false,
  is_add_on: false,
  free_trial: null,
};

export const ModelPricing = ({
  data,
  mutate,
  mutateAutumnProducts,
  autumnProducts,
  productCounts,
  mutateCounts,
  queryStates,
  setQueryStates,
}: {
  data: any;
  mutate: any;
  mutateAutumnProducts: any;
  autumnProducts: Product[];
  productCounts: any;
  mutateCounts: any;
  queryStates: any;
  setQueryStates: any;
}) => {
  const getCurProduct = () => {
    if (queryStates.productId) {
      const prod = data.products.find(
        (p: Product) => p.id === queryStates.productId
      );
      if (prod) {
        return prod;
      }
    } else if (data.products.length > 0) {
      return data.products[0];
    }
    return defaultProduct;
  };

  const curProduct = getCurProduct();
  const [firstItemCreated, setFirstItemCreated] = useState(
    autumnProducts.some((p: Product) => p.items.length > 0)
  );

  const [editingNewProduct, setEditingNewProduct] = useState(
    nullish(curProduct)
  );

  const productDataState = useProductData({
    originalProduct: curProduct as any,
    originalFeatures: data.features as any,
  });

  const { product } = productDataState;

  // useEffect(() => {
  //   if (data) {
  //     const curProduct = data.products.find(
  //       (p: Product) => p.id === product.id
  //     );

  //     if (!curProduct) {
  //       if (data.products.length > 0) {
  //         setProduct(data.products[0]);
  //       }
  //     }
  //   }
  // }, [data]);

  if (!product) return null;

  const stripeConnected = data?.org.stripe_connected;

  return (
    <ModelPricingContext.Provider
      value={{
        firstItemCreated,
        setFirstItemCreated,
        editingNewProduct,
        setEditingNewProduct,
        // product,
        // setProduct,
        productDataState,
        mutate,
        data,
        productCount: productCounts?.[product?.id ?? ""],
        queryStates,
        setQueryStates,
        mutateAutumnProducts,
        mutateCounts,
      }}
    >
      <ProductsContext.Provider value={{ productCounts, mutate }}>
        <div className="flex flex-col w-full h-full items-center justify-between overflow-hidden">
          <div className="w-full p-10 flex flex-col gap-4 justify-center items-center">
            <div className="max-w-[800px] w-full">
              <div className="flex gap-4 items-center justify-between mb-6 h-8">
                <p className="text-xl font-medium">Create your plans</p>
                {firstItemCreated && (
                  <div className="flex gap-0 items-center">
                    <SelectEditProduct />
                    <NewProductPopover />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4 w-full">
                <EditProduct
                  data={data}
                  mutate={mutate}
                  // setProduct={setProduct}
                  // features={features}
                  // setFeatures={setFeatures}
                  // entityFeatureIds={entityFeatureIds}
                  // setEntityFeatureIds={setEntityFeatureIds}
                  // product={product}
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "w-full px-10 flex flex-col gap-4 items-center transition-all duration-1000 ease-in-out overflow-hidden",
              firstItemCreated
                ? `py-10 max-h-[500px] opacity-100 translate-y-0 rounded-t-xl shadow-[0_-2px_2px_-2px_rgba(0,0,0,0.05)] 
                bg-stone-100 border-t border-zinc-200 pb-6`
                : "py-0 max-h-0 opacity-0 translate-y-4"
            )}
          >
            <AutumnProvider
              backendUrl={`${import.meta.env.VITE_BACKEND_URL}/demo`}
              includeCredentials={true}
            >
              <div className="gap-8 flex justify-center max-w-[800px] w-full flex-col">
                {!stripeConnected && (
                  <ConnectStripeStep mutate={mutate} productData={data} />
                )}
                <PricingTable
                  products={autumnProducts}
                  stripeConnected={stripeConnected}
                />
                <div className="flex justify-end w-full">
                  <Button
                    className="w-fit"
                    onClick={() => {
                      setQueryStates({
                        page: "integrate",
                      });
                    }}
                  >
                    Next: Integrate Autumn <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </AutumnProvider>
          </div>
        </div>
      </ProductsContext.Provider>
    </ModelPricingContext.Provider>
  );
};

const NewProductPopover = () => {
  const [open, setOpen] = useState(false);
  const {
    mutate,
    productDataState: { setProduct },
  } = useModelPricingContext();

  const axiosInstance = useAxiosInstance();
  const [details, setDetails] = useState({
    name: "",
    id: "",
  });

  const [creating, setCreating] = useState(false);

  const handleSave = async () => {
    try {
      setCreating(true);
      await axiosInstance.post("/v1/products", {
        name: details.name,
        id: details.id,
      });
      await mutate();
      const newProduct = {
        ...defaultProduct,
        name: details.name,
        id: details.id,
      };
      setProduct(newProduct);
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create product"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="w-fit text-primary"
          onClick={async () => {}}
        >
          <PlusIcon size={14} />
          New Product
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-3">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-t3">New Product</p>
          <div className="flex gap-2">
            <Input
              placeholder="Name"
              value={details.name}
              onChange={(e) =>
                setDetails({
                  ...details,
                  name: e.target.value,
                  id: slugify(e.target.value),
                })
              }
            />
            <Input placeholder="ID" disabled value={details.id} />
          </div>
          <div className="flex gap-2 justify-end w-full">
            <Button
              className="w-fit"
              variant="outline"
              // size="sm"
              onClick={handleSave}
              isLoading={creating}
            >
              Create
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Get latest product
const getAutumnProducts = () => {
  // const curProductItems = product.items.map((item: any) =>
  //   getProductItemResponse({
  //     item,
  //     features: data.features,
  //     currency: "USD",
  //   })
  // );
  // return [product, ...autumnProducts];
  // const properties: ProductProperties = {
  //   has_trial: notNullish(product.free_trial),
  //   is_free: isFreeProduct(product.items),
  //   is_one_off: isOneOffProduct(product.items),
  //   updateable: product.items.some(
  //     (item: any) => item.usage_model == UsageModel.Prepaid
  //   ),
  // };
  // const latestProduct = {
  //   ...product,
  //   items: curProductItems,
  //   properties,
  // };
  // const curProducts = autumnProducts.filter(
  //   (p: Product) => p.id !== product.id
  // );
  // if (!firstItemCreated) {
  //   return [];
  // }
  // const newProducts = [latestProduct, ...curProducts] as any;
  // return sortProductsV2({ products: newProducts }) as Product[];
};
