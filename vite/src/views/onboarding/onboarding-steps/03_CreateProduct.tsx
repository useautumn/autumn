import Step from "@/components/general/OnboardingStep";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { ProductsTable } from "@/views/products/ProductsTable";
import SmallSpinner from "@/components/general/SmallSpinner";
import { ProductsContext } from "@/views/products/ProductsContext";
import CreateProduct, { defaultProduct } from "@/views/products/CreateProduct";
import { ProductConfig } from "@/views/products/ProductConfig";
import { Product } from "@autumn/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import { ProductContext } from "@/views/products/product/ProductContext";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductItemTable } from "@/views/products/product/product-item/ProductItemTable";
import { CopyIcon, PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

export const CreateProductStep = ({
  productId,
  setProductId,
}: {
  productId: string;
  setProductId: (productId: string) => void;
}) => {
  let [newProduct, setNewProduct] = useState<any>(defaultProduct);
  let [createClicked, setCreateClicked] = useState(false);
  let [createProductLoading, setCreateProductLoading] = useState(false);

  let env = useEnv();
  let axiosInstance = useAxiosInstance({ env });

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

  const [product, setProduct] = useState<any>();

  useEffect(() => {
    if (data?.product) {
      setProduct(data.product);
    }
  }, [data]);

  return (
    <Step title="Create your first product">
      <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
        <div className="flex flex-col gap-2 text-t2 w-full lg:w-1/3">
          <p>
            First, create your <span className="font-bold">Features</span>, the
            parts of your application you charge for.
          </p>
          <p>
            Then, create your <span className="font-bold">Products</span>, which
            are the pricing plans that grant access to those features.
          </p>
          <p>Some examples have been created for you.</p>
        </div>
        <div className="w-full lg:w-2/3 min-w-md max-w-lg flex flex-col gap-6">
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
                }}
              >
                <div className="flex w-full">
                  <div className="flex flex-col gap-4 w-full">
                    <div className="flex">
                      <div className="flex-1 w-full min-w-sm">
                        <ProductItemTable />
                      </div>
                    </div>
                  </div>
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
        </div>
      </div>
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
    <div className="rounded-sm flex gap-4 items-end">
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
      <div className="flex justify-end">
        <Button
          variant="gradientPrimary"
          onClick={createProduct}
          isLoading={createProductLoading}
          startIcon={<PlusIcon size={15} />}
        >
          Create
        </Button>
      </div>
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
