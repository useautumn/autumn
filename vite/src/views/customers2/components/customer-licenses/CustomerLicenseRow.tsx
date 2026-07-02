import type { LicensePoolResponse } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";

export function CustomerLicenseRow({
	pool,
	entityId,
	onAssign,
	onUnassign,
	isAssigning,
	isUnassigning,
}: {
	pool: LicensePoolResponse;
	entityId: string;
	onAssign: () => void;
	onUnassign: (assignmentId: string) => void;
	isAssigning: boolean;
	isUnassigning: boolean;
}) {
	const entityAssignment = pool.assignments.find(
		(assignment) => assignment.entity_id === entityId,
	);
	const canAssign = !entityAssignment && pool.inventory.available > 0;

	return (
		<div className="flex items-center justify-between rounded-xl border px-3 h-11 bg-background">
			<div className="flex items-center gap-2 min-w-0">
				<LicenseIcon size={14} className="text-subtle shrink-0" />
				<div className="flex flex-col min-w-0">
					<span className="text-sm truncate">{pool.license_product_name}</span>
					<span className="text-xs text-tertiary-foreground">
						{pool.inventory.assigned}/
						{pool.inventory.included_quantity + pool.inventory.paid_quantity}{" "}
						assigned · {pool.inventory.available} available
					</span>
				</div>
			</div>

			{entityAssignment ? (
				<Button
					variant="secondary"
					size="mini"
					isLoading={isUnassigning}
					onClick={() => onUnassign(entityAssignment.assignment_id)}
				>
					Unassign
				</Button>
			) : (
				<Button
					variant="primary"
					size="mini"
					disabled={!canAssign}
					isLoading={isAssigning}
					onClick={onAssign}
				>
					Assign
				</Button>
			)}
		</div>
	);
}
