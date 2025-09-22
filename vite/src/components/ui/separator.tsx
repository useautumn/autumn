"use client";

import * as SeparatorPrimitive from "@radix-ui/react-separator";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Separator({
	className,
	orientation = "horizontal",
	decorative = true,
	...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
	return (
		<SeparatorPrimitive.Root
			data-slot="separator-root"
			decorative={decorative}
			orientation={orientation}
			className={cn(
				"shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px bg-[#E3E3E3]",
				className,
			)}
			{...props}
		/>
	);
}

export { Separator };
