import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 dark:border-zinc-800 dark:focus:ring-zinc-300

const badgeVariants = cva(
	`inline-flex items-center rounded-lg border border-zinc-200 px-1.5 py-0.5

	// Custom stuff
	text-body-secondary
	`,
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/80 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/80",

				muted: "bg-muted border border-transparent",
				green: "bg-green-500/10 text-green-500 border-transparent",
			},
			size: {
				default: "px-1.5 py-0.5 text-xs",
				sm: "px-1.5 py-0.5 text-[10px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Badge({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Badge };
