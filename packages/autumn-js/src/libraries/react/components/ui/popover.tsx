import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "../../lib/utils";

const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

const PopoverTrigger: typeof PopoverPrimitive.Trigger =
	PopoverPrimitive.Trigger;

const PopoverAnchor: typeof PopoverPrimitive.Anchor = PopoverPrimitive.Anchor;

type PopoverContentRef = React.ElementRef<typeof PopoverPrimitive.Content>;
type PopoverContentProps = React.ComponentPropsWithoutRef<
	typeof PopoverPrimitive.Content
>;

const PopoverContent: React.ForwardRefExoticComponent<
	PopoverContentProps & React.RefAttributes<PopoverContentRef>
> = React.forwardRef<PopoverContentRef, PopoverContentProps>(
	({ className, align = "center", sideOffset = 4, ...props }, ref) => (
		<PopoverPrimitive.Content
			ref={ref}
			align={align}
			sideOffset={sideOffset}
			className={cn(
				"au-root au-z-[9999] au-w-72 au-rounded-md au-border au-bg-popover au-p-4 au-text-popover-foreground au-shadow-md au-outline-none data-[state=open]:au-animate-in data-[state=closed]:au-animate-out data-[state=closed]:au-fade-out-0 data-[state=open]:au-fade-in-0 data-[state=closed]:au-zoom-out-95 data-[state=open]:au-zoom-in-95 data-[side=bottom]:au-slide-in-from-top-2 data-[side=left]:au-slide-in-from-right-2 data-[side=right]:au-slide-in-from-left-2 data-[side=top]:au-slide-in-from-bottom-2 au-origin-[--radix-popover-content-transform-origin]",
				className,
			)}
			{...props}
		/>
	),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
