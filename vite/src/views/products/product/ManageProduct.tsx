import { EditProductToolbar } from "./EditProductToolbar";
import { ProductEntitlementTable } from "./entitlements/ProductEntitlementTable";
import { CreateEntitlement } from "./entitlements/CreateEntitlement";
import { ProductPricingTable } from "./prices/ProductPricingTable";
import { CreatePrice } from "./prices/CreatePrice";

import { Badge } from "@/components/ui/badge";
import { CreateFreeTrial } from "./free-trial/CreateFreeTrial";
import { EditFreeTrialToolbar } from "./EditFreeTrialToolbar";
import { AdminHover } from "@/components/general/AdminHover";

export const ManageProduct = ({
  product,
  customerData,
}: {
  product: any;
  customerData?: any;
}) => {
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
          {!customerData && (
            <EditProductToolbar product={product} className="text-t2" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Entitlements</p>
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
      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Free Trial</p>
        {product.free_trial && (
          <>
            <div className="flex justify-between gap-4 bg-white p-3 rounded-sm border overflow-x-auto">
              <div className="flex gap-16 shrink-0">
                <div className="flex rounded-sm items-center gap-6">
                  <p className="text-xs text-t2 w-32 bg-stone-50 font-medium p-1 text-center">
                    Length{" "}
                  </p>
                  <p className="text-sm text-t2">
                    {product.free_trial.length} days
                  </p>
                </div>
                <div className="flex rounded-sm items-center gap-6">
                  <p className="text-xs text-t2 bg-stone-50 font-medium p-1 w-32 text-center">
                    Unique Fingerprint
                  </p>
                  <p className="text-sm text-t2">
                    {product.free_trial.unique_fingerprint ? "Yes" : "No"}
                  </p>
                </div>
                <div className="flex rounded-sm items-center gap-6">
                  <p className="text-xs text-t2 bg-stone-50 font-medium p-1 w-32 text-center">
                    Card Required
                  </p>
                  <p className="text-sm text-t2">Yes</p>
                </div>
              </div>
              <EditFreeTrialToolbar product={product} />
            </div>
          </>
        )}
        {!product.free_trial && <CreateFreeTrial />}
      </div>
    </div>
  );
};
