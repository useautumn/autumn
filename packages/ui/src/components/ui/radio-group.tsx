import { cn } from "@autumn/ui";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import * as React from "react";

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupPrimitive.Props>(
	({ className, ...props }, ref) => {
		return (
			<RadioGroupPrimitive
				data-slot="radio-group"
				className={cn("grid gap-2", className)}
				{...props}
				ref={ref}
			/>
		);
	},
);
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef<HTMLButtonElement, Radio.Root.Props>(
	({ className, style, ...props }, ref) => {
		return (
			<Radio.Root
				ref={ref}
				data-slot="radio-group-item"
				style={{ cursor: "pointer", ...style }}
				className={cn(
					"w-[13px] h-[13px] px-0.5 py-[3px] rounded-xl inline-flex flex-col justify-center items-center gap-2.5 overflow-hidden transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",

					"bg-interactive-secondary shadow-[0px_2px_4px_0px_rgba(0,0,0,0.02)] border-[0.70px] border",
					"data-checked:bg-violet-600 data-checked:shadow-none data-checked:border-none",

					"hover:bg-interactive-secondary-hover hover:border-primary hover:border-[1px]",
					className,
				)}
				{...props}
			>
				<Radio.Indicator
					data-slot="radio-group-indicator"
					className="flex items-center justify-center"
				>
					<div className="w-1 h-1 bg-white rounded-full" />
				</Radio.Indicator>
			</Radio.Root>
		);
	},
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
