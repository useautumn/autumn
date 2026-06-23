import type * as React from "react";
import { useId } from "react";
import { cn } from "../../lib/utils";
import { Checkbox } from "../ui/checkbox";

interface TextCheckboxProps extends React.ComponentProps<typeof Checkbox> {
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
				disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
			)}
		>
			<Checkbox id={id} disabled={disabled} {...checkboxProps} />
			<div
				className={cn(
					"text-sm font-semibold",
					disabled
						? "cursor-not-allowed text-placeholder"
						: "cursor-pointer text-muted-foreground",
				)}
			>
				{children}
			</div>
		</label>
	);
};
