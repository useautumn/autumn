import { EditProductToolbar } from "./EditProductToolbar";
import { ProductEntitlementTable } from "./entitlements/ProductEntitlementTable";
import { CreateEntitlement } from "./entitlements/CreateEntitlement";
import { ProductPricingTable } from "./prices/ProductPricingTable";
import { CreatePrice } from "./prices/CreatePrice";

import { Badge } from "@/components/ui/badge";
import { AdminHover } from "@/components/general/AdminHover";
import { FreeTrialView } from "./free-trial/FreeTrialView";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Gift } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProductContext } from "./ProductContext";
import { useNavigate } from "react-router";
import { getBackendErr, getRedirectUrl } from "@/utils/genUtils";
import { useEnv } from "@/utils/envUtils";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AppEnv,
  MigrationJob,
  MigrationJobStep,
  ProductV2,
} from "@autumn/shared";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pricesOnlyOneOff } from "@/utils/product/priceUtils";
import ConfirmMigrateDialog from "./versioning/ConfirmMigrateDialog";
import { CreateProductItem } from "./product-item/CreateProductItem";
import { ProductItemTable } from "./product-item/ProductItemTable";

export const ManageProduct = ({
  customerData,
  showFreeTrial,
  setShowFreeTrial,
  version,
}: {
  customerData?: any;
  showFreeTrial: boolean;
  setShowFreeTrial: (showFreeTrial: boolean) => void;
  version?: number;
}) => {
  const env = useEnv();
  let { numVersions, count, product } = useProductContext();

  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between grid grid-cols-10 gap-8 pl-10">
        <div className="col-span-2 flex">
          <div className="flex flex-col gap-1 justify-center w-full whitespace-nowrap">
            <AdminHover texts={[product.internal_id!]}>
              <h2 className="text-lg font-medium w-fit whitespace-nowrap">
                {product.name}
              </h2>
            </AdminHover>
          </div>
        </div>

        {/* {!customerData && <CountAndMigrate />} */}

        {/* <Select
            value={version ? version.toString() : product.version.toString()}
            onValueChange={async (value) => {
              navigate(
                getRedirectUrl(
                  `${
                    customerData
                      ? `/customers/${customerData.customer.id}`
                      : "/products"
                  }/${product.id}?version=${value}`,
                  env
                )
              );
            }}
          >
            <SelectTrigger className="h-7 w-[140px] bg-white">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: numVersions }, (_, i) => i + 1)
                .reverse()
                .map((version) => (
                  <SelectItem key={version} value={version.toString()}>
                    Version {version}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select> */}
        {/* {!customerData && (
            <EditProductToolbar product={product} className="text-t2" />
          )} */}
      </div>

      <div className="flex flex-col gap-10">
        <ProductItemTable />
        {/* <div className="flex flex-col">
          <ProductEntitlementTable entitlements={product.entitlements} />
        </div>
        <div className="flex flex-col">
          {product.prices.length > 0 && (
            <ProductPricingTable prices={product.prices} />
          )}
        </div> */}
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
