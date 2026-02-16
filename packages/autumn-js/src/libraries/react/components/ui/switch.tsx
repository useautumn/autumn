"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "../../lib/utils";

type SwitchRef = React.ElementRef<typeof SwitchPrimitives.Root>;
type SwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>;

const Switch: React.ForwardRefExoticComponent<
	SwitchProps & React.RefAttributes<SwitchRef>
> = React.forwardRef<SwitchRef, SwitchProps>(({ className, ...props }, ref) => (
	<SwitchPrimitives.Root
		className={cn(
			"au-peer au-inline-flex au-h-5 au-w-9 au-shrink-0 au-cursor-pointer au-items-center au-rounded-full au-border-2 au-border-transparent au-shadow-sm au-transition-colors focus-visible:au-outline-none focus-visible:au-ring-2 focus-visible:au-ring-ring focus-visible:au-ring-offset-2 focus-visible:au-ring-offset-background au-disabled:cursor-not-allowed au-disabled:opacity-50 data-[state=checked]:au-bg-primary data-[state=unchecked]:au-bg-input",
			className,
		)}
		{...props}
		ref={ref}
	>
		<SwitchPrimitives.Thumb
			className={cn(
				"au-pointer-events-none au-block au-h-4 au-w-4 au-rounded-full au-bg-background au-shadow-lg au-ring-0 au-transition-transform data-[state=checked]:au-translate-x-4 data-[state=unchecked]:au-translate-x-0",
			)}
		/>
	</SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
