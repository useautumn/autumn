import SmallSpinner from "@/components/general/SmallSpinner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { isOneOffProduct } from "@/utils/product/priceUtils";
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
import ConfirmMigrateDialog from "./ConfirmMigrateDialog";
import { useProductQuery } from "../hooks/useProductQuery";
import { useProductCountsQuery } from "../hooks/queries/useProductCountsQuery";
import { useMigrationsQuery } from "../hooks/queries/useMigrationsQuery.tsx";

export const CountAndMigrate = () => {
  const { product, numVersions } = useProductQuery();
  const { counts, refetch: refetchCounts } = useProductCountsQuery();
  const { migrations, refetch: refetchMigrations } = useMigrationsQuery();

  const axiosInstance = useAxiosInstance();
  const [loading, setLoading] = useState(false);
  const [confirmMigrateOpen, setConfirmMigrateOpen] = useState(false);

  const migrateCustomers = async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.post("/v1/migrations", {
        from_product_id: product.id,
        from_version: product.version,
        to_product_id: product.id,
        to_version: numVersions,
      });

      await refetchMigrations();

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
    if (migrations.length > 0) {
      // Run poll job on mutate
      const pollInterval = setInterval(() => {
        refetchCounts();
        refetchMigrations();
      }, 5000);
      return () => clearInterval(pollInterval);
    }
  }, [migrations]);

  if (!counts) {
    return <></>;
  }

  const renderCurrentMigration = () => {
    const migration: MigrationJob = migrations[0];

    const getCusDetails = migration.step_details[MigrationJobStep.GetCustomers];
    const migrateDetails =
      migration.step_details[MigrationJobStep.MigrateCustomers];

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="h-4 hover:bg-zinc-50 cursor-pointer flex items-center gap-2
            w-full
            "
            >
              <span className="flex items-center gap-2 justify-between w-full pr-2">
                <span className="font-medium text-t3 text-xs">
                  Migration in progress
                </span>
                <SmallSpinner size={16} />
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

  const fromIsOneOff = isOneOffProduct(product.items);
  const migrateCount = counts?.active - counts?.canceled - counts?.custom;
  const version = product.version;

  const canMigrate =
    counts &&
    migrateCount > 0 &&
    !fromIsOneOff &&
    version &&
    version < numVersions;

  return (
    <>
      <ConfirmMigrateDialog
        open={confirmMigrateOpen}
        setOpen={setConfirmMigrateOpen}
        startMigration={migrateCustomers}
      />
      {!canMigrate ? null : migrations.length > 0 ? (
        renderCurrentMigration()
      ) : (
        <Button
          variant="outline"
          className="
          w-full
          h-6 text-sm font-medium text-zinc-600 bg-white border-zinc-200 hover:bg-zinc-50 hover:text-zinc-700 transition-colors"
          onClick={onMigrateClicked}
        >
          {loading && <SmallSpinner size={16} />}
          {`Migrate to v${numVersions}`}
        </Button>
      )}
    </>
  );
};
