import { Collapsible, CollapsibleTrigger } from "@autumn/ui";
import { ChevronRightIcon } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { Fragment, useId } from "react";
import { cn } from "@/lib/utils";
import { COLLAPSE_VARIANTS } from "@/views/customers2/customer/customerAnimations";
import type { VisibleBillingOptionSection } from "./types/billingOptionSectionTypes";

export function BillingOptionSection({
	section,
	open,
	onOpenChange,
}: {
	section: VisibleBillingOptionSection;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const panelId = useId();
	const reduceMotion = useReducedMotion() ?? false;
	const state = open ? "open" : "closed";

	return (
		<Collapsible
			open={open}
			onOpenChange={onOpenChange}
			className="flex flex-col"
		>
			<CollapsibleTrigger
				aria-controls={panelId}
				className="group/billing-section flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<ChevronRightIcon
					className={cn(
						"size-3.5 shrink-0 text-tertiary-foreground transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
						open && "rotate-90",
					)}
				/>
				<span className="shrink-0 text-xs font-medium text-tertiary-foreground transition-colors group-hover/billing-section:text-foreground">
					{section.label}
				</span>
				<span className="ml-auto min-w-0 truncate text-xs text-subtle">
					{section.summary}
				</span>
			</CollapsibleTrigger>
			<m.div
				id={panelId}
				variants={COLLAPSE_VARIANTS}
				custom={reduceMotion}
				initial={false}
				animate={state}
				inert={!open}
				className="overflow-hidden"
			>
				<div className="flex flex-col gap-4 pt-0.5 pb-4">
					{section.options.map((option) => (
						<Fragment key={option.id}>{option.row}</Fragment>
					))}
				</div>
			</m.div>
		</Collapsible>
	);
}
