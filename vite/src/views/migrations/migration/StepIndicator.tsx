import type { Icon } from "@phosphor-icons/react";
import {
	CaretRightIcon,
	FunnelSimpleIcon,
	GearIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StepId = "filter" | "operations" | "live";

export const STEPS: { id: StepId; label: string; icon: Icon }[] = [
	{ id: "filter", label: "Filter", icon: FunnelSimpleIcon },
	{ id: "operations", label: "Operations", icon: GearIcon },
	{ id: "live", label: "Execution", icon: UsersIcon },
];

export function StepIndicator({
	step,
	onStepChange,
	stepMeta,
	children,
}: {
	step: StepId;
	onStepChange: (step: StepId) => void;
	stepMeta?: Partial<Record<StepId, ReactNode>>;
	children?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between pt-2">
			<div className="flex items-center gap-2">
				{STEPS.map((s, i) => {
					const isActive = step === s.id;
					const StepIcon = s.icon;
					return (
						<div key={s.id} className="flex items-center gap-2">
							{i > 0 && <CaretRightIcon size={14} className="text-subtle" />}
							<button
								type="button"
								onClick={() => onStepChange(s.id)}
								className={cn(
									"flex items-center gap-2 text-md cursor-pointer transition-colors",
									isActive
										? "text-foreground font-medium"
										: "text-tertiary-foreground hover:text-muted-foreground",
								)}
							>
								<StepIcon
									size={16}
									weight={isActive ? "fill" : "regular"}
									className={cn(!isActive && "text-subtle")}
								/>
								{s.label}
								{stepMeta?.[s.id]}
							</button>
						</div>
					);
				})}
			</div>
			{children && <div className="flex items-center gap-2">{children}</div>}
		</div>
	);
}
