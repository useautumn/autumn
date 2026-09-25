import {
	overlayMotionClassName,
	overlaySurfaceClassName,
} from "@autumn/ui/lib/overlay-classes";
import { cn } from "@autumn/ui/lib/utils";
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
						"w-72 p-3 outline-hidden",
						overlaySurfaceClassName,
						overlayMotionClassName,
						className,
					)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

export { Popover, PopoverTrigger, PopoverContent };
