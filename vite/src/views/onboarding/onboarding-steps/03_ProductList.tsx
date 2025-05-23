import { Button } from "@/components/ui/button";
import Step from "@/components/general/OnboardingStep";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { useEnv } from "@/utils/envUtils";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";
import { ProductsContext } from "@/views/products/ProductsContext";
import { ProductsTable } from "@/views/products/ProductsTable";
import { Product, products, ProductV2 } from "@autumn/shared";
import {
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { AddProductButton } from "@/views/customers/customer/add-product/AddProductButton";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import CreateProduct from "@/views/products/CreateProduct";
import { useSearchParams } from "react-router";

export const ProductList = ({
  data,
  mutate,
}: {
  data: any;
  mutate: () => Promise<void>;
}) => {
  const env = useEnv();

  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [product, setProduct] = useState<any>(data.products[0]);
  const [features, setFeatures] = useState<any[]>(data.features);
  const [open, setOpen] = useState(false);

  if (!data.products) return null;

  return (
    <Step
      title={token ? "Your products" : "Create your products"}
      number={1}
      description={
        <p>
          Products define the features your customers can access and how much
          they cost. Create your first product to get started ☝️.
        </p>
      }
    >
      <EditProductDialog
        product={product}
        setProduct={setProduct}
        features={features}
        setFeatures={setFeatures}
        mutate={mutate}
        open={open}
        setOpen={setOpen}
      />
      <ProductsContext.Provider
        value={{
          products,
          env,
          onboarding: true,
          mutate,
        }}
      >
        <PageSectionHeader
          title="Products"
          isOnboarding={true}
          addButton={
            <>
              {/* <Button variant="add">Test Data</Button> */}
              <CreateProduct
                onSuccess={async (newProduct: ProductV2) => {
                  await mutate();
                  setProduct(newProduct);
                  setOpen(true);
                }}
              />
            </>
          }
          className="pr-0"
        />

        <ProductsTable
          products={data.products}
          onRowClick={(id) => {
            setProduct(data.products.find((p: ProductV2) => p.id === id));
            setOpen(true);
          }}
        />
      </ProductsContext.Provider>
    </Step>
  );
};

const EditProductDialog = ({
  product,
  features,
  setProduct,
  setFeatures,
  mutate,
  open,
  setOpen,
}: {
  product: any;
  setProduct: (product: any) => void;
  features: any[];
  setFeatures: (features: any[]) => void;
  mutate: () => Promise<void>;
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const env = useEnv();
  const axiosInstance = useAxiosInstance();
  const [createProductLoading, setCreateProductLoading] = useState(false);

  const updateProduct = async () => {
    setCreateProductLoading(true);
    setCreateProductLoading(true);
    try {
      const res = await ProductService.updateProduct(
        axiosInstance,
        product.id,
        product,
      );
      toast.success("Product items successfully created");
      await mutate();
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
    setCreateProductLoading(false);
    setCreateProductLoading(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 py-8 min-w-[500px] min-h-[300px] flex flex-col justify-between">
        <DialogTitle className="text-t2 font-semibold px-10 hidden">
          {/* Edit Product */}
        </DialogTitle>
        <div>
          <FeaturesContext.Provider
            value={{
              env,
              mutate,
            }}
          >
            <ProductContext.Provider
              value={{
                product,
                setProduct,
                mutate,
                env,
                features,
                setFeatures,
              }}
            >
              <ManageProduct hideAdminHover={true} />
            </ProductContext.Provider>
          </FeaturesContext.Provider>
        </div>
        <DialogFooter>
          <div className="flex justify-end gap-2 px-10">
            <Button
              isLoading={createProductLoading}
              variant="gradientPrimary"
              onClick={updateProduct}
              className="min-w-44 w-44 max-w-44"
            >
              Update Product
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
