import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { ToggleButton } from "@/components/general/ToggleButton";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { FeaturesContext } from "@/views/features/FeaturesContext";
import { CreateFreeTrial } from "@/views/products/product/free-trial/CreateFreeTrial";
import { CreateProductItem2 } from "@/views/products/product/product-item/CreateProductItem2";
import { ProductItemTable } from "@/views/products/product/product-item/ProductItemTable";
import { ProductContext } from "@/views/products/product/ProductContext";
import { Button } from "@/components/ui/button";
import { AddTrialButton } from "./AddTrialButton";
import { useEffect, useState } from "react";
import { useEnv } from "@/utils/envUtils";
import { handleAutoSave } from "./model-pricing-utils/modelPricingUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useModelPricingContext } from "./ModelPricingContext";
import { ProductRowToolbar } from "@/views/products/components/ProductRowToolbar";

export const EditProduct = ({
  data,
  mutate,
  product,
  setProduct,
}: {
  data: any;
  mutate: any;
  product: any;
  setProduct: any;
}) => {
  const [details, setDetails] = useState({
    name: product.name,
    id: product.id,
  });

  const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);
  const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  const { productCounts, editingNewProduct, setEditingNewProduct } =
    useModelPricingContext();
  const axiosInstance = useAxiosInstance();
  const env = useEnv();

  useEffect(() => {
    if (data) {
      setFeatures(data.features);
    }
  }, [data]);

  const hasItems = product.items.length > 0;

  const handleToggleSettings = async (key: string) => {
    const curValue = product[key];
    const newProduct = { ...product, [key]: !curValue };

    setProduct(newProduct);

    handleAutoSave({
      axiosInstance,
      productId: product.id ? product.id : details.id,
      product: { ...product, [key]: !curValue },
      mutate,
    });
  };

  return (
    <div className="flex flex-col gap-4 justify-between h-full">
      <div className="flex gap-4 transition-all duration-500 ease-in-out">
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
              entityFeatureIds,
              setEntityFeatureIds,
              isOnboarding: true,
              autoSave: true,
            }}
          >
            <div
              className={`flex flex-col gap-4 transition-all duration-500 ease-in-out ${
                hasItems ? "w-3/5" : "w-full"
              }`}
            >
              <div className="flex gap-2 items-end justify-between">
                <div className="flex gap-2 items-center">
                  <div>
                    <FieldLabel className="text-t2 font-medium">
                      Name
                    </FieldLabel>
                    <Input
                      onBlur={async () => {
                        await handleAutoSave({
                          axiosInstance,
                          productId: product.id ? product.id : details.id,
                          product: {
                            ...product,
                            name: details.name,
                            id: details.id,
                          },
                          mutate,
                        });
                        setProduct({
                          ...product,
                          name: details.name,
                          id: details.id,
                        });
                      }}
                      placeholder="Free Plan"
                      value={details.name}
                      onChange={(e) => {
                        const curProduct = data?.products.find(
                          (p: any) => p.id === details.id
                        );
                        console.log("Cur product:", curProduct);
                        const newIdData = editingNewProduct
                          ? {
                              id: slugify(e.target.value),
                            }
                          : {};
                        setDetails({
                          ...details,
                          name: e.target.value,
                          ...newIdData,
                        });
                      }}
                    />
                  </div>
                  <div>
                    <FieldLabel className="text-t2 font-medium">ID</FieldLabel>
                    <Input
                      value={details.id}
                      disabled={true}
                      placeholder="free_plan"
                    />
                  </div>
                </div>
                <div className="flex items-center h-6">
                  <ProductRowToolbar
                    product={product}
                    productCounts={productCounts}
                    isOnboarding={true}
                  />
                </div>
              </div>
              <CreateFreeTrial
                open={freeTrialModalOpen}
                setOpen={setFreeTrialModalOpen}
              />
              <div
                className={`bg-white border border-zinc-200 transition-all duration-500 ease-in-out ${
                  hasItems ? "w-full" : "w-full"
                }`}
              >
                <ProductItemTable />
              </div>
              <CreateProductItem2 />
            </div>

            <div
              className={`transition-all duration-500 ease-in-out ${
                hasItems
                  ? "w-2/5 opacity-100 translate-x-0 ml-4"
                  : "w-0 opacity-0 translate-x-8 overflow-hidden"
              }`}
            >
              <div className="flex flex-col gap-4" style={{ width: "320px" }}>
                <div>
                  <ToggleButton
                    disabled={product?.is_add_on}
                    buttonText="Default Product"
                    value={product?.is_default}
                    className="text-t2 font-medium h-fit mb-2"
                    setValue={() => handleToggleSettings("is_default")}
                  />
                  <div className="text-t3 text-sm" style={{ width: "320px" }}>
                    A default product is enabled by default for all new users,
                    typically used for your free plan.
                  </div>
                </div>
                <div className="">
                  <ToggleButton
                    disabled={product?.is_default}
                    buttonText="Add-on Product"
                    className="text-t2 font-medium h-fit mb-2"
                    value={product?.is_add_on}
                    setValue={() => handleToggleSettings("is_add_on")}
                  />
                  <div className="text-t3 text-sm" style={{ width: "320px" }}>
                    A default product is enabled by default for all new users,
                    typically used for your free plan.
                  </div>
                </div>
                <div>
                  <AddTrialButton />
                  <div className="text-t3 text-sm" style={{ width: "320px" }}>
                    Add a free trial to your product.
                  </div>
                </div>
              </div>
            </div>
          </ProductContext.Provider>
        </FeaturesContext.Provider>
      </div>
    </div>
  );
};
