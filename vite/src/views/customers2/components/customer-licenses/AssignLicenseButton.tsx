import type { LicensePoolResponse } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { CaretDownIcon, PlusIcon } from "@phosphor-icons/react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";

/**
 * "Assign License" header action, mirroring Attach Plan: a dropdown of the
 * customer's license pools that still have availability and aren't already
 * assigned to this entity. Disabled with an explanatory tooltip when none
 * qualify.
 */
export function AssignLicenseButton({
	pools,
	entityId,
	onAssign,
	isAssigning,
}: {
	pools: LicensePoolResponse[];
	entityId: string;
	onAssign: (pool: LicensePoolResponse) => void;
	isAssigning: boolean;
}) {
	const isAssignedToEntity = (pool: LicensePoolResponse) =>
		pool.assignments.some((assignment) => assignment.entity_id === entityId);

	const assignablePools = pools.filter(
		(pool) => pool.inventory.available > 0 && !isAssignedToEntity(pool),
	);

	if (assignablePools.length === 0) {
		const allAssignedToEntity = pools.every(isAssignedToEntity);
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex">
						<Button
							variant="primary"
							size="mini"
							className="gap-1 font-medium"
							disabled
						>
							<PlusIcon className="size-3.5" />
							Assign License
						</Button>
					</span>
				</TooltipTrigger>
				<TooltipContent>
					{allAssignedToEntity
						? "All of this customer's licenses are already assigned to this entity"
						: "No licenses remaining — every seat on this customer's plans is assigned"}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="primary"
					size="mini"
					className="gap-1 font-medium"
					isLoading={isAssigning}
				>
					<PlusIcon className="size-3.5" />
					Assign License
					<CaretDownIcon className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={4}>
				{assignablePools.map((pool) => (
					<DropdownMenuItem
						key={pool.pool_id}
						onClick={() => onAssign(pool)}
						className="flex items-center justify-between gap-3"
					>
						<span className="flex items-center gap-2">
							<LicenseIcon size={12} className="text-tertiary-foreground" />
							{pool.license_product_name}
						</span>
						<span className="text-xs text-tertiary-foreground">
							{pool.inventory.available} available
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
