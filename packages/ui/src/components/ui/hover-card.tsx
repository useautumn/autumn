import { cn } from "@autumn/ui";
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import * as React from "react";

function HoverCard({
	openDelay: _openDelay,
	closeDelay: _closeDelay,
	...props
}: PreviewCardPrimitive.Root.Props & {
	openDelay?: number;
	closeDelay?: number;
}) {
	return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

function HoverCardTrigger({
	asChild,
	children,
	...props
}: PreviewCardPrimitive.Trigger.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<PreviewCardPrimitive.Trigger
				data-slot="hover-card-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props}>
			{children}
		</PreviewCardPrimitive.Trigger>
	);
}

function HoverCardContent({
	className,
	align = "center",
	sideOffset = 4,
	side = "bottom",
	...props
}: PreviewCardPrimitive.Popup.Props &
	Pick<
		PreviewCardPrimitive.Positioner.Props,
		"align" | "side" | "sideOffset"
	>) {
	return (
		<PreviewCardPrimitive.Portal data-slot="hover-card-portal">
			<PreviewCardPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				positionMethod="fixed"
				className="isolate z-50"
			>
				<PreviewCardPrimitive.Popup
					data-slot="hover-card-content"
					className={cn(
						"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-64 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden",
						className,
					)}
					{...props}
				/>
			</PreviewCardPrimitive.Positioner>
		</PreviewCardPrimitive.Portal>
	);
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
