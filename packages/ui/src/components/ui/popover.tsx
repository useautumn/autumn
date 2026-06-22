import { cn } from "@autumn/ui";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	asChild,
	children,
	...props
}: PopoverPrimitive.Trigger.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<PopoverPrimitive.Trigger
				data-slot="popover-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<PopoverPrimitive.Trigger data-slot="popover-trigger" {...props}>
			{children}
		</PopoverPrimitive.Trigger>
	);
}

function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	side = "bottom",
	onEscapeKeyDown: _onEscapeKeyDown,
	onPointerDownOutside: _onPointerDownOutside,
	onOpenAutoFocus: _onOpenAutoFocus,
	onCloseAutoFocus: _onCloseAutoFocus,
	forceMount: _forceMount,
	asChild: _asChild,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<PopoverPrimitive.Positioner.Props, "align" | "side" | "sideOffset"> & {
		onEscapeKeyDown?: (e: any) => void;
		onPointerDownOutside?: (e: any) => void;
		onOpenAutoFocus?: (e: any) => void;
		onCloseAutoFocus?: (e: any) => void;
		forceMount?: boolean;
		asChild?: boolean;
	}) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				positionMethod="fixed"
				className="isolate z-[300]"
			>
				<PopoverPrimitive.Popup
					data-slot="popover-content"
					className={cn(
						"bg-interactive-secondary text-muted-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-72 rounded-lg ring-1 ring-foreground/10 p-4 shadow-md outline-hidden",
						className,
					)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverTrigger, PopoverContent };
