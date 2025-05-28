import Step from "@/components/general/OnboardingStep";
import { FeaturesContext } from "@/views/features/FeaturesContext";

import { defaultProduct } from "@/views/products/CreateProduct";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import { ProductContext } from "@/views/products/product/ProductContext";
import { ProductItemTable } from "@/views/products/product/product-item/ProductItemTable";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

export const CreateProductStep = ({
  productId,
  setProductId,
  number,
}: {
  productId: string;
  setProductId: (productId: string) => void;
  number: number;
}) => {
  const env = useEnv();
  const axiosInstance = useAxiosInstance({ env });

  const [newProduct, setNewProduct] = useState<any>(defaultProduct);
  const [createClicked, setCreateClicked] = useState(false);
  const [createProductLoading, setCreateProductLoading] = useState(false);

  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/${newProduct.id}/data`,
    env,
    enabled: createClicked,
  });

  const createProduct = async () => {
    setCreateProductLoading(true);
    try {
      const res = await ProductService.createProduct(axiosInstance, newProduct);

      setCreateClicked(true);
      toast.success("Product created");
      await mutate();
      setProductId(newProduct.id);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to create product"));
    }
    setCreateProductLoading(false);
  };

  const updateProduct = async () => {
    setCreateProductLoading(true);
    try {
      const res = await ProductService.updateProduct(
        axiosInstance,
        productId,
        product,
      );
      toast.success("Product items successfully created");
      await mutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to update product"));
    }
    setCreateProductLoading(false);
  };

  const [product, setProduct] = useState<any>();
  const [features, setFeatures] = useState<any[]>();

  useEffect(() => {
    if (data?.product) {
      setProduct(data.product);
      setFeatures(data.features);
    }
  }, [data]);

  return (
    <Step
      title="Create your first product"
      number={number}
      description={
        <p>
          Define your product&apos;s pricing models and what customers get
          access to.
        </p>
      }
    >
      {product ? (
        <FeaturesContext.Provider
          value={{
            env,
            mutate,
          }}
        >
          <ProductContext.Provider
            value={{
              ...data,
              mutate,
              env,
              product,
              setProduct,
              features,
              setFeatures,
            }}
          >
            <ProductItemTable isOnboarding={true} />
            <div className="flex justify-end mt-4">
              <Button
                isLoading={createProductLoading}
                variant="gradientPrimary"
                onClick={updateProduct}
                className="min-w-44 w-44 max-w-44"
              >
                Update Product
              </Button>
            </div>
          </ProductContext.Provider>
        </FeaturesContext.Provider>
      ) : (
        <CreateProductCard
          newProduct={newProduct}
          setNewProduct={setNewProduct}
          createProduct={createProduct}
          createProductLoading={createProductLoading}
        />
      )}
    </Step>
  );
};

const CreateProductCard = ({
  newProduct,
  setNewProduct,
  createProduct,
  createProductLoading,
}: {
  newProduct: any;
  setNewProduct: any;
  createProduct: any;
  createProductLoading: boolean;
}) => {
  return (
    <div className="flex gap-2 items-start">
      {/* <ProductConfig
        product={newProduct}
        setProduct={setNewProduct}
        isUpdate={false}
      /> */}
      <Input
        placeholder="Product name"
        value={newProduct.name}
        onChange={(e: any) =>
          setNewProduct({
            ...newProduct,
            name: e.target.value,
            id: slugify(e.target.value),
          })
        }
        endContent={
          <div className="flex gap-2 items-center">
            <p className="whitespace-nowrap text-t3">{newProduct.id}</p>
          </div>
        }
      />

      <Button
        variant="gradientPrimary"
        className="min-w-44 w-44 max-w-44"
        onClick={createProduct}
        isLoading={createProductLoading}
        // startIcon={<PlusIcon size={15} />}
      >
        Create Product
      </Button>
    </div>
  );
};

{
  /* <FeaturesContext.Provider
  value={{
    features: features,
    env,
    mutate: productMutate,
    onboarding: true,
  }}
>
  {productLoading ? (
    <SmallSpinner />
  ) : (
    <div className="flex flex-col gap-2">
      <p className="text-t2 font-medium text-md">Features</p>
      <FeaturesTable />
      <CreateFeature />
    </div>
  )}
</FeaturesContext.Provider> */
}
{
  /* <ProductsContext.Provider
  value={{
    ...productData,
    env,
    mutate: productMutate,
    onboarding: true,
  }}
>
  {productLoading ? (
    <SmallSpinner />
  ) : (
    <div className="flex flex-col gap-2">
      <p className="text-t2 font-medium text-md">Products</p>
      <ProductsTable products={productData?.products} />
      <div>
        <CreateProduct />
      </div>
    </div>
  )}
</ProductsContext.Provider> */
}
