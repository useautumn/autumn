import type * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/v2/buttons/Button";
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
		<Button
			variant="secondary"
			size="mini"
			onClick={handleClick}
			className={cn(
				"flex items-center gap-1.5 rounded-lg shadow-none h-6 pr-1.5 pl-[7px] py-[5px]",
				className,
			)}
		>
			<Checkbox
				checked={checked}
				ref={ref}
				onClick={(e) => e.preventDefault()}
				className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
				{...props}
			/>
			{props.children}
		</Button>
	);
});
