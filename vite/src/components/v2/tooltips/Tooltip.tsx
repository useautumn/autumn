"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";
import { cn } from "@/lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return (
		<TooltipProvider>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	);
}

function TooltipTrigger({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 6,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					`z-50 overflow-hidden rounded-[6px] px-2 py-[3px]
          bg-t12 text-white
          text-[13px] font-medium leading-[1.6] tracking-[-0.039px]
          shadow-[0px_0px_4px_2px_rgba(0,0,0,0.05)]
          animate-in fade-in-0 zoom-in-95
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
          data-[side=bottom]:slide-in-from-top-2
          data-[side=left]:slide-in-from-right-2
          data-[side=right]:slide-in-from-left-2
          data-[side=top]:slide-in-from-bottom-2
          before:absolute before:z-10
          before:data-[side=top]:-bottom-1 before:data-[side=top]:left-1/2 before:data-[side=top]:-translate-x-1/2
          before:data-[side=top]:border-l-[7px] before:data-[side=top]:border-r-[7px] before:data-[side=top]:border-t-[6px]
          before:data-[side=top]:border-l-transparent before:data-[side=top]:border-r-transparent before:data-[side=top]:border-t-t12
          before:data-[side=bottom]:-top-1 before:data-[side=bottom]:left-1/2 before:data-[side=bottom]:-translate-x-1/2
          before:data-[side=bottom]:border-l-[7px] before:data-[side=bottom]:border-r-[7px] before:data-[side=bottom]:border-b-[6px]
          before:data-[side=bottom]:border-l-transparent before:data-[side=bottom]:border-r-transparent before:data-[side=bottom]:border-b-t12
          before:data-[side=left]:-right-1 before:data-[side=left]:top-1/2 before:data-[side=left]:-translate-y-1/2
          before:data-[side=left]:border-t-[7px] before:data-[side=left]:border-b-[7px] before:data-[side=left]:border-l-[6px]
          before:data-[side=left]:border-t-transparent before:data-[side=left]:border-b-transparent before:data-[side=left]:border-l-t12
          before:data-[side=right]:-left-1 before:data-[side=right]:top-1/2 before:data-[side=right]:-translate-y-1/2
          before:data-[side=right]:border-t-[7px] before:data-[side=right]:border-b-[7px] before:data-[side=right]:border-r-[6px]
          before:data-[side=right]:border-t-transparent before:data-[side=right]:border-b-transparent before:data-[side=right]:border-r-t12
          `,
					className,
				)}
				{...props}
			>
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
