import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
	HTMLButtonElement,
	CheckboxPrimitive.Root.Props & {
		iconClassName?: string;
	}
>(({ className, iconClassName, ...props }, ref) => (
	<CheckboxPrimitive.Root
		ref={ref}
		data-slot="checkbox"
		className={cn(
			"peer shrink-0 rounded border border-gray-300 size-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-gray-900 data-checked:border-gray-900 transition-none",
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator
			data-slot="checkbox-indicator"
			className="flex items-center justify-center text-white transition-none"
		>
			<CheckIcon className={cn("size-3", iconClassName)} color="white" />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
