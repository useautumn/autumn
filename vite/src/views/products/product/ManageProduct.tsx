import { EditProductToolbar } from "./EditProductToolbar";
import { ProductEntitlementTable } from "./entitlements/ProductEntitlementTable";
import { CreateEntitlement } from "./entitlements/CreateEntitlement";
import { ProductPricingTable } from "./prices/ProductPricingTable";
import { CreatePrice } from "./prices/CreatePrice";

import { Badge } from "@/components/ui/badge";
import { CreateFreeTrial } from "./free-trial/CreateFreeTrial";
import { EditFreeTrialToolbar } from "./EditFreeTrialToolbar";
import { AdminHover } from "@/components/general/AdminHover";
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
import { AppEnv, MigrationJob, MigrationJobStep } from "@autumn/shared";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { pricesOnlyOneOff } from "@/utils/product/priceUtils";

export const ManageProduct = ({
  product,
  customerData,
  version,
}: {
  product: any;
  customerData?: any;
  version?: number;
}) => {
  const env = useEnv();
  let { numVersions, count } = useProductContext();
  const navigate = useNavigate();

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
            <Badge className="flex items-center gap-1 w-fit text-xs text-lime-600 bg-lime-50 border border-lime-200 hover:bg-lime-100">
              <span className="">
                Managing <span className="font-bold">{product.name}</span> for
              </span>
              <span className="">
                <span className="font-bold">{customerData.customer.name}</span>
              </span>
            </Badge>
          )}

          {!customerData && <CountAndMigrate />}

          {/* {customerData && numVersions > 1 && (
            <Badge className="flex items-center gap-1 w-fit text-xs text-lime-600 bg-lime-50 border border-lime-200 hover:bg-lime-100">
              <span className="">Version {product.version}</span>
            </Badge>
          )} */}
          {numVersions > 1 && (
            <Select
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
            </Select>
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

const CountAndMigrate = () => {
  let {
    product,
    counts,
    numVersions,
    version,
    existingMigrations,
    mutate,
    mutateCount,
  } = useProductContext();

  let env = useEnv();
  let axiosInstance = useAxiosInstance({ env });
  let [loading, setLoading] = useState(false);

  const onMigrateClicked = async () => {
    setLoading(true);
    try {
      let { data } = await axiosInstance.post("/v1/migrations", {
        from_product_id: product.id,
        from_version: version,
        to_product_id: product.id,
        to_version: numVersions,
      });
      await mutate();

      toast.success(`Migration started. ID: ${data.id}`);
    } catch (error) {
      toast.error(getBackendErr(error, "Something went wrong with migration"));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (existingMigrations.length > 0) {
      // Run poll job on mutate
      let pollInterval = setInterval(() => {
        mutate();
        mutateCount();
      }, 5000);
      return () => clearInterval(pollInterval);
    }
  }, [existingMigrations]);

  if (!counts) {
    return <></>;
  }

  const renderCurrentMigration = () => {
    let migration: MigrationJob = existingMigrations[0];

    let getCusDetails = migration.step_details[MigrationJobStep.GetCustomers];
    let migrateDetails =
      migration.step_details[MigrationJobStep.MigrateCustomers];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="h-7 px-3 bg-zinc-50 hover:bg-zinc-50 border border-zinc-200 cursor-pointer flex items-center gap-2 rounded-full
            
            "
            >
              <span className="flex items-center gap-2">
                <SmallSpinner size={16} />
                <span className="text-sm font-medium text-zinc-500 text-xs">
                  Migration in progress
                </span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            className="w-40 flex flex-col gap-2
          bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3
          "
          >
            <p className="font-medium">Migration in progress</p>
            {getCusDetails && (
              <div className="flex flex-col gap-1">
                <p className="">
                  <span>Total count:</span> {getCusDetails?.total_customers}
                </p>
                <p className="">
                  <span>Canceled count:</span>{" "}
                  {getCusDetails?.canceled_customers}
                </p>
                <p className="">
                  <span>Custom count:</span> {getCusDetails?.custom_customers}
                </p>
              </div>
            )}
            {migrateDetails && (
              <div className="flex flex-col gap-1">
                <p className="">
                  <span>Succeeded:</span> {migrateDetails?.succeeded}
                </p>
                <p className="">
                  <span>Failed:</span> {migrateDetails?.failed}
                </p>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  let fromIsOneOff = pricesOnlyOneOff(product.prices);

  let migrateCount = counts?.active - counts?.canceled - counts?.custom;
  let activeCount = counts?.active;
  let canMigrate =
    counts &&
    migrateCount > 0 &&
    !fromIsOneOff &&
    version &&
    version < numVersions;
  let trialingCount = counts?.trialing;

  return (
    <div className="flex items-center gap-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="h-7 px-3 bg-zinc-50 hover:bg-zinc-50 border border-zinc-200 rounded-full inline-flex items-center cursor-pointer">
              <span className="text-sm font-medium text-zinc-500">
                {activeCount} active users
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            className="w-30 px-2 flex flex-col gap-2
            bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3
            "
            side="bottom"
            sideOffset={4}
          >
            <p className="">
              <span>Canceled:</span> {counts?.canceled}
            </p>
            {trialingCount > 0 && (
              <p className="">
                <span>Trialing:</span> {trialingCount}
              </p>
            )}
            {counts?.custom > 0 && (
              <p className="">
                <span>Custom:</span> {counts?.custom}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {!canMigrate ? null : existingMigrations.length > 0 ? (
        renderCurrentMigration()
      ) : (
        <Button
          variant="outline"
          className="h-7 text-sm font-medium text-zinc-600 bg-white border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
          onClick={onMigrateClicked}
        >
          {loading && <SmallSpinner size={16} />}
          {`Migrate to v${numVersions}`}
        </Button>
      )}
    </div>
  );
};
