import type * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type * as React from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";

interface TextCheckboxProps
	extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
	children: React.ReactNode;
}

export const TextCheckbox = ({
	children,
	disabled,
	...checkboxProps
}: TextCheckboxProps) => {
	const id = useId();
	return (
		<label
			htmlFor={id}
			className={cn(
				"flex items-center gap-2 w-fit whitespace-nowrap",
				disabled ? "cursor-not-allowed opacity-50" : "cursor-default",
			)}
		>
			<Checkbox id={id} disabled={disabled} {...checkboxProps} />
			<div
				className={cn(
					"text-checkbox-label",
					disabled && "text-muted-foreground",
				)}
			>
				{children}
			</div>
		</label>
	);
};
