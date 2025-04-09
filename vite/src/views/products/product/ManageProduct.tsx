import { EditProductToolbar } from "./EditProductToolbar";
import { ProductEntitlementTable } from "./entitlements/ProductEntitlementTable";
import { CreateEntitlement } from "./entitlements/CreateEntitlement";
import { ProductPricingTable } from "./prices/ProductPricingTable";
import { CreatePrice } from "./prices/CreatePrice";

import { Badge } from "@/components/ui/badge";
import { AdminHover } from "@/components/general/AdminHover";
import { FreeTrialView } from "./free-trial/FreeTrialView";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { useState } from "react";
import { Gift } from "lucide-react";

export const ManageProduct = ({
  product,
  customerData,
  showFreeTrial,
  setShowFreeTrial,
}: {
  product: any;
  customerData?: any;
  showFreeTrial: boolean;
  setShowFreeTrial: (showFreeTrial: boolean) => void;
}) => {
  // const [showFreeTrial, setShowFreeTrial] = useState(product.free_trial);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 px-6 justify-center w-full">
          <AdminHover texts={[product.internal_id!]}>
            <h2 className="text-lg font-medium text-start w-full">
              {product.name}
            </h2>
          </AdminHover>
          <div className="flex items-center gap-2">
            {product.is_add_on && (
              <Badge variant="outline" className="bg-white">
                Add On
              </Badge>
            )}
            {product.is_default && (
              <Badge variant="outline" className="bg-white">
                Default Product
              </Badge>
            )}
            {product.group && (
              <Badge variant="outline" className="bg-white">
                Product Group:{" "}
                <span className="font-semibold ml-1">
                  {" " + product.group}
                </span>
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {customerData && (
            <Badge className="flex items-center gap-1 w-fit text-xs text-lime-600 bg-lime-50 border border-lime-200">
              <span className="">
                Managing <span className="font-bold">{product.name}</span> for
              </span>
              <span className="">
                <span className="font-bold">{customerData.customer.name}</span>
              </span>
            </Badge>
          )}
          {!customerData && (
            <EditProductToolbar product={product} className="text-t2" />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-16">
        <div className="flex flex-col">
          <ProductEntitlementTable entitlements={product.entitlements} />
        </div>
        <div className="flex flex-col">
          {product.prices.length > 0 && (
            <ProductPricingTable prices={product.prices} />
          )}
          {/* <CreateEntitlement /> */}
          {/* <CreatePrice /> */}
        </div>
      </div>
      {showFreeTrial && (
        <div className="flex flex-col gap-4">
          <p className="text-md text-t2 font-medium">Free Trial</p>
          <FreeTrialView product={product} />
        </div>
      )}
    </div>
  );
};
