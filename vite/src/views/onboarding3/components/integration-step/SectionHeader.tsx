import type { ReactNode } from "react";
import { StepBadge } from "@/components/v2/badges/StepBadge";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
	stepNumber: number;
	title: string | ReactNode;
	description?: string | ReactNode;
	className?: string;
}

export const SectionHeader = ({
	stepNumber,
	title,
	description,
	className,
}: SectionHeaderProps) => {
	return (
		<div className={cn("flex flex-col gap-2.5", className)}>
			<div className="flex flex-row items-center gap-2">
				<StepBadge>{stepNumber}</StepBadge>
				<h2 className="text-sub">{title}</h2>
			</div>
			<div className="pl-[32px]">
				{!!description && <p className="text-body">{description}</p>}
			</div>
		</div>
	);
};
