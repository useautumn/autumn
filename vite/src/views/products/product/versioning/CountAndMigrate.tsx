import SmallSpinner from "@/components/general/SmallSpinner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { pricesOnlyOneOff } from "@/utils/product/priceUtils";
import { MigrationJob, MigrationJobStep } from "@autumn/shared";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@radix-ui/react-tooltip";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useProductContext } from "../ProductContext";
import ConfirmMigrateDialog from "./ConfirmMigrateDialog";

export const CountAndMigrate = () => {
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
  let [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);

  const migrateCustomers = async () => {
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

  const onMigrateClicked = () => {
    setConfirmMigrateOpen(true);
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
            w-full
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

  let fromIsOneOff = pricesOnlyOneOff(product.items);

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
    <div className="flex items-center gap-3 whitespace-nowrap ">
      <ConfirmMigrateDialog
        open={confirmMigrateOpen}
        setOpen={setConfirmMigrateOpen}
        startMigration={migrateCustomers}
      />

      {!canMigrate ? null : existingMigrations.length > 0 ? (
        renderCurrentMigration()
      ) : (
        <Button
          variant="outline"
          className="
          w-full
          h-7 text-sm font-medium text-zinc-600 bg-white border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
          onClick={onMigrateClicked}
        >
          {loading && <SmallSpinner size={16} />}
          {`Migrate to v${numVersions}`}
        </Button>
      )}
    </div>
  );
};
