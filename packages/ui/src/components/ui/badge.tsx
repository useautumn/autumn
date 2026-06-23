import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-lg border border-zinc-200 px-1.5 py-0.5 text-body-secondary",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/80 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/80",

				muted: "bg-muted border border-border/50",
				green: "bg-green-500/10 text-green-500 border-transparent",
				secondary:
					"border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/80",
				outline: "text-zinc-950 dark:text-zinc-50",
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
	render: renderProp,
	...props
}: useRender.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant, size }), className),
			},
			props,
		),
		render: renderProp,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge };
