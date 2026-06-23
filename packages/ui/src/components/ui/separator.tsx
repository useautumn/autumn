"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";
import { cn } from "../../lib/utils";

function Separator({
	className,
	orientation = "horizontal",
	decorative = true,
	...props
}: SeparatorPrimitive.Props & {
	orientation?: "horizontal" | "vertical";
	decorative?: boolean;
}) {
	return (
		<SeparatorPrimitive
			data-slot="separator-root"
			orientation={orientation}
			data-orientation={orientation}
			className={cn(
				"shrink-0 data-[orientation=horizontal]:!h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px bg-border atmn-sep",
				className,
			)}
			{...props}
		/>
	);
}

export { Separator };
