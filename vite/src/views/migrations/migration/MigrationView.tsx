import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useEnv } from "@/utils/envUtils";
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
	const env = useEnv();
	const navigate = useNavigate();

	const selectedCustomer = useMigrationSheetStore((s) => s.selectedCustomer);
	const setSelectedCustomer = useMigrationSheetStore(
		(s) => s.setSelectedCustomer,
	);
	const closeSheet = useCallback(
		() => setSelectedCustomer(null),
		[setSelectedCustomer],
	);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") closeSheet();
		};
		window.addEventListener("keydown", handleEscape);
		return () => {
			window.removeEventListener("keydown", handleEscape);
			closeSheet();
		};
	}, [closeSheet]);

	const migration = migrations.find((m) => m.id === migration_id);

	const goToMigrations = () => navigateTo("/migrations", navigate, env);

	if (isLoading) return <LoadingScreen />;

	if (!migration) {
		return (
			<ErrorScreen>
				<div className="text-t2 text-sm">Migration not found</div>
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
							<Breadcrumb className="text-t3 flex">
								<BreadcrumbList className="text-t3 text-xs w-full">
									<BreadcrumbItem
										onClick={goToMigrations}
										className="cursor-pointer"
									>
										Migrations
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem className="text-t2">
										{migration.id}
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
							<MigrationEditor migration={migration} />
						</div>
					</div>
				</div>
			</motion.div>

			<AnimatePresence mode="wait">
				{selectedCustomer && (
					<motion.div
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={SHEET_ANIMATION}
						className="absolute right-0 top-0 bottom-0"
						style={{ width: "28rem", zIndex: 45 }}
					>
						<SheetContainer className="w-full bg-card border-l border-border/40 h-full relative">
							<SheetCloseButton onClose={closeSheet} />
							<MigrationCustomerSheet
								migrationId={migration.id}
								customer={selectedCustomer}
							/>
						</SheetContainer>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
