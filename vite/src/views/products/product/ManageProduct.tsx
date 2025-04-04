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
}: {
  product: any;
  customerData?: any;
}) => {
  const [showFreeTrial, setShowFreeTrial] = useState(product.free_trial);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <AdminHover texts={[product.internal_id!]}>
            <h2 className="text-lg font-medium">{product.name}</h2>
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
          <ToggleDisplayButton
            show={showFreeTrial}
            onClick={() => setShowFreeTrial(!showFreeTrial)}
            disabled={product.free_trial}
          >
            <Gift size={14} />
            Free trial
          </ToggleDisplayButton>
          {!customerData && (
            <EditProductToolbar product={product} className="text-t2" />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Features</p>
        {product.entitlements.length > 0 && (
          <ProductEntitlementTable entitlements={product.entitlements} />
        )}
        <CreateEntitlement />
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Pricing</p>
        {product.prices.length > 0 && (
          <ProductPricingTable prices={product.prices} />
        )}
        <CreatePrice />
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
