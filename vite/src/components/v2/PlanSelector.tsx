import type { ProductV2 } from "@autumn/shared";
import { CaretDownIcon, CubeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./dropdowns/DropdownMenu";

interface PlanSelectorProps {
	plans: ProductV2[];
	selectedPlanId: string | null;
	onPlanChange: (planId: string) => void;
	className?: string;
}

export function PlanSelector({
	plans,
	selectedPlanId,
	onPlanChange,
	className,
}: PlanSelectorProps) {
	const [open, setOpen] = useState(false);
	const selectedPlan = plans.find((p) => p.id === selectedPlanId);

	const handleSelect = (planId: string) => {
		onPlanChange(planId);
		setOpen(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center justify-between rounded-lg border bg-transparent text-sm outline-none input-base input-shadow-default input-state-open p-2 w-40 h-6!",
						className,
					)}
				>
					{selectedPlan ? (
						<div className="flex items-center gap-2">
							<div className="shrink-0">
								<CubeIcon size={14} weight="duotone" className="text-t2" />
							</div>
							<span className="text-t2 truncate w-26 text-left">
								{selectedPlan.name}
							</span>
						</div>
					) : (
						<span className="text-t4 text-xs">Select plan</span>
					)}
					<CaretDownIcon className="size-3 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<div className="max-h-60 overflow-y-auto">
					{plans.length === 0 ? (
						<div className="py-4 text-center text-sm text-t4">
							No plans found.
						</div>
					) : (
						plans.map((plan) => (
							<DropdownMenuItem
								key={plan.id}
								onClick={() => handleSelect(plan.id)}
								className="py-2 px-2.5"
							>
								<div className="flex items-center gap-2">
									<div className="shrink-0">
										<CubeIcon size={14} weight="duotone" className="text-t2" />
									</div>
									<span className="truncate">{plan.name}</span>
								</div>
							</DropdownMenuItem>
						))
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
