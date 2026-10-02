import type { BalanceAllocationControl } from "@autumn/shared";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";

export function CustomerAllocationControls({
	controls,
	featureNameById,
	onEdit,
}: {
	controls: BalanceAllocationControl[];
	featureNameById: Map<string, string>;
	onEdit: (control: BalanceAllocationControl) => void;
}) {
	if (controls.length === 0) return null;
	return (
		<div className={TABLE_TRAY_CLASS}>
			<div className="flex h-7 items-center px-4 text-xs text-tertiary-foreground">
				Balance allocations
			</div>
			<div
				className={cn(
					TABLE_TRAY_SURFACE_CLASS,
					"flex flex-col divide-y divide-table-row-divider",
				)}
			>
				{controls.map((control) => (
					<button
						key={control.feature_id}
						type="button"
						className="flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-table-row-hover"
						onClick={() => onEdit(control)}
						aria-label={`Edit ${featureNameById.get(control.feature_id) ?? control.feature_id} balance allocations`}
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">
								{featureNameById.get(control.feature_id) ?? control.feature_id}
							</span>
							<span className="block text-xs text-tertiary-foreground">
								{control.allocations.length}{" "}
								{control.allocations.length === 1 ? "entity" : "entities"} ·
								every {control.interval}
							</span>
							<span className="mt-1 block text-xs text-tertiary-foreground">
								{control.allocations
									.map(
										({ entity_id, amount }) =>
											`${entity_id}: ${amount.toLocaleString()}`,
									)
									.join(" · ")}
							</span>
						</span>
						<span className="text-xs text-tertiary-foreground">Edit</span>
					</button>
				))}
			</div>
		</div>
	);
}
