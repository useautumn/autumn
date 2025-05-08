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
  Entity,
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
import { EntityHeader } from "@/views/customers/customer/components/entity-header";
import { SelectEntity } from "@/views/customers/customer/customer-sidebar/customer-entities";

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
  let { product, entityId, customer } = useProductContext();

  const navigate = useNavigate();

  // const entity = customer?.entities.find(
  //   (entity: Entity) => entity.id === entityId
  // );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pl-10 pr-10">
        <div className="col-span-2 flex">
          <div className="flex flex-col gap-1 justify-center w-full whitespace-nowrap">
            <AdminHover texts={[product.internal_id!]}>
              <h2 className="text-lg font-medium w-fit whitespace-nowrap">
                {product.name}
              </h2>
            </AdminHover>
          </div>
        </div>
        {/* <EntityHeader entity={entity} /> */}
        <SelectEntity entityId={entityId} entities={customer?.entities} />
      </div>

      <div className="flex flex-col gap-10">
        <ProductItemTable />
      </div>
    </div>
  );
};
