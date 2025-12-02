"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { RadioGroupItem } from "./RadioGroup";

interface AreaRadioGroupItemProps {
	className?: string;
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
}

function AreaRadioGroupItem({
	className,
	value,
	label,
	description,
	disabled = false,
}: AreaRadioGroupItemProps) {
	const id = useId();

	return (
		<div className={cn("flex items-start space-x-[6px]", className)}>
			<RadioGroupItem
				value={value}
				id={id}
				className="mt-[3px]"
				disabled={disabled}
			/>
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<label
						htmlFor={id}
						className={cn(
							"text-checkbox-label",
							disabled && "cursor-not-allowed opacity-50",
						)}
					>
						{label}
					</label>
				</div>
				{description && (
					<p className="text-body-sec-paragraph">{description}</p>
				)}
			</div>
		</div>
	);
}

export { AreaRadioGroupItem };
