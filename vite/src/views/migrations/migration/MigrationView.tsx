import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
	SheetBackdrop,
} from "@autumn/ui";
import { motion } from "motion/react";
import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate, useParams } from "react-router";
import { AdminHover } from "@/components/general/AdminHover";
import { InlineSheetPanel } from "@/components/v2/sheets/InlineSheetPanel";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { navigateTo } from "@/utils/genUtils";
import { SHEET_ANIMATION } from "@/views/customers2/customer/customerAnimations";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { MigrationCustomerSheet } from "./live/MigrationCustomerSheet";
import { useMigrationSheetStore } from "./live/useMigrationSheetStore";
import { MigrationEditor } from "./MigrationEditor";

export function MigrationView() {
	const { migration_id } = useParams<{ migration_id: string }>();
	const { migrations, isLoading } = useMigrationsQuery();
	const navigate = useNavigate();

	const selectedCustomer = useMigrationSheetStore((s) => s.selectedCustomer);
	const setSelectedCustomer = useMigrationSheetStore(
		(s) => s.setSelectedCustomer,
	);
	const liveFormState = useMigrationSheetStore((s) => s.liveFormState);
	const closeSheet = useCallback(
		() => setSelectedCustomer(null),
		[setSelectedCustomer],
	);

	useHotkeys("escape", closeSheet);
	useEffect(() => () => closeSheet(), [closeSheet]);

	const migration = migrations.find((m) => m.id === migration_id);

	const goToMigrations = () => navigateTo("/migrations", navigate);

	if (isLoading) return <LoadingScreen />;

	if (!migration) {
		return (
			<ErrorScreen>
				<div className="text-muted-foreground text-sm">Migration not found</div>
			</ErrorScreen>
		);
	}

	return (
		<div className="flex w-full h-full overflow-hidden relative">
			<motion.div
				className="h-full overflow-hidden absolute inset-0 z-0"
				animate={{
					width: selectedCustomer ? "calc(100% - 28rem)" : "100%",
				}}
				transition={SHEET_ANIMATION}
			>
				<div className="flex flex-col overflow-y-auto absolute inset-0 pb-8">
					<div className="flex flex-col h-fit w-full max-w-5xl mx-auto pt-4 sm:pt-8">
						<div className="px-4 sm:px-10 flex flex-col gap-2">
							<Breadcrumb className="text-tertiary-foreground flex">
								<BreadcrumbList className="text-tertiary-foreground text-xs w-full">
									<BreadcrumbItem
										onClick={goToMigrations}
										className="cursor-pointer"
									>
										Migrations
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem className="text-muted-foreground">
										<AdminHover
											texts={[
												{
													key: "Migration internal ID",
													value: migration.internal_id,
												},
											]}
										>
											<span>{migration.id}</span>
										</AdminHover>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
							<MigrationEditor migration={migration} />
						</div>
					</div>
				</div>
			</motion.div>

			<SheetBackdrop isOpen={!!selectedCustomer} onClose={closeSheet} />

			<InlineSheetPanel
				isOpen={!!selectedCustomer}
				onClose={closeSheet}
				transition={SHEET_ANIMATION}
			>
				{selectedCustomer && (
					<MigrationCustomerSheet
						migrationId={migration.id}
						customer={selectedCustomer}
						operations={liveFormState.operations}
						noBillingChanges={liveFormState.noBillingChanges}
					/>
				)}
			</InlineSheetPanel>
		</div>
	);
}
