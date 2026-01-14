import type * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const CheckboxButton = React.forwardRef<
	React.ElementRef<typeof CheckboxPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, onCheckedChange, checked, ...props }, ref) => {
	const handleClick = () => {
		const newChecked = !checked;
		onCheckedChange?.(newChecked);
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: Checkbox renders as button, so wrapper cannot be button or label
		<span
			role="checkbox"
			aria-checked={!!checked}
			tabIndex={0}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			className={cn(
				"cursor-pointer select-none bg-transparent flex items-center gap-1.5 rounded-lg h-6 pr-1.5 pl-[7px] py-[5px] text-t4 hover:text-t1 text-xs font-medium",
				className,
			)}
		>
			<Checkbox
				checked={checked}
				ref={ref}
				tabIndex={-1}
				onClick={(e) => e.preventDefault()}
				className="data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:shadow-none size-3.5 shadow-[0_2px_4px_0_#00000005,inset_0_2px_1px_0_#FFFFFF] rounded-md border border-border bg-interactive-secondary dark:shadow-none pointer-events-none"
				iconClassName="size-2"
				{...props}
			/>
			{props.children}
		</span>
	);
});
