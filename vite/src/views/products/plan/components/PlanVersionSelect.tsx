import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SmallSpinner,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useProductVersionsQuery } from "@/hooks/queries/useProductVersionsQuery";
import {
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { cn } from "@/lib/utils";
import {
	useAllVariantsView,
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import { ActiveVersionDot, PlanVersionOption } from "./PlanVersionOption";
import { versionLabel } from "./versionLabel";

const MIGRATE_CUSTOMERS = "__migrate_customers__";

export const PlanVersionSelect = ({
	canMigrate,
	onMigrateCustomers,
}: {
	canMigrate: boolean;
	onMigrateCustomers: () => void;
}) => {
	const product = useProductStore((s) => s.product);
	const { versionCounts } = useProductQuery();
	const { queryStates, setQueryStates } = useProductQueryState();
	const isCusPlanEditor = useIsCusPlanEditor();
	const showAllVariants = useAllVariantsView();
	const [open, setOpen] = useState(false);
	const { versions, isLoading } = useProductVersionsQuery({
		productId: product.id,
		enabled: open,
	});

	const currentVersion = queryStates.version || product.version;
	const rows = versions.length > 0 ? versions : [product];
	const sortedRows = [...rows].sort((left, right) => {
		if (Boolean(left.active) !== Boolean(right.active)) {
			return left.active ? -1 : 1;
		}
		return (right.version ?? 0) - (left.version ?? 0);
	});

	const handleVersionChange = (version: string) => {
		if (version === MIGRATE_CUSTOMERS) {
			onMigrateCustomers();
			return;
		}
		const versionNumber = Number.parseInt(version, 10);
		const selected = sortedRows.find((row) => row.version === versionNumber);
		// Pin unless we know the row is active; a missing flag must not read as active.
		if (Boolean(selected?.active) && !isCusPlanEditor) {
			setQueryStates({ version: null });
			return;
		}
		setQueryStates({ version: versionNumber });
	};

	const currentRow =
		sortedRows.find((row) => row.version === currentVersion) ?? product;

	const items = {
		...Object.fromEntries(
			sortedRows.map((row) => [
				String(row.version),
				versionLabel({ versionSlug: row.version_slug, version: row.version }),
			]),
		),
		...(canMigrate ? { [MIGRATE_CUSTOMERS]: "Migrate customers" } : {}),
	};

	const triggerContent = (
		<SelectTrigger className="w-32 !h-6" size="sm">
			<span className="flex min-w-0 items-center gap-1.5">
				{currentRow.active ? <ActiveVersionDot active /> : null}
				<span className="truncate">
					{versionLabel({
						versionSlug: currentRow.version_slug,
						version: currentRow.version,
					})}
				</span>
			</span>
		</SelectTrigger>
	);

	return (
		<Select
			value={String(currentVersion)}
			onValueChange={handleVersionChange}
			onOpenChange={setOpen}
			disabled={showAllVariants}
			items={items}
		>
			{showAllVariants ? (
				<Tooltip>
					<TooltipTrigger render={<span />}>{triggerContent}</TooltipTrigger>
					<TooltipContent>
						Latest versions of all plans are shown
					</TooltipContent>
				</Tooltip>
			) : (
				triggerContent
			)}
			<SelectContent className="min-w-40 max-w-64">
				{isLoading && versions.length === 0 ? (
					<div className="flex items-center justify-center py-2">
						<SmallSpinner size={10} className="text-tertiary-foreground" />
					</div>
				) : (
					sortedRows.map((row) => {
						const selected = row.version === currentVersion;
						return (
							<SelectItem
								key={row.version}
								value={String(row.version)}
								indicator={false}
								className={cn("*:last:w-full", selected && "bg-accent/70")}
							>
								<PlanVersionOption
									label={versionLabel({
										versionSlug: row.version_slug,
										version: row.version,
									})}
									active={Boolean(row.active)}
									selected={selected}
									count={versionCounts[row.version]?.active || 0}
									countLoaded={Object.keys(versionCounts).length > 0}
								/>
							</SelectItem>
						);
					})
				)}
				{canMigrate && (
					<>
						<SelectSeparator />
						<SelectItem value={MIGRATE_CUSTOMERS} indicator={false}>
							<div className="flex items-center gap-2">
								<ArrowsClockwiseIcon />
								<span>Migrate customers</span>
							</div>
						</SelectItem>
					</>
				)}
			</SelectContent>
		</Select>
	);
};
