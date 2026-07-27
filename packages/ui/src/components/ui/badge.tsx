import { cn } from "@autumn/ui/lib/utils";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
	"inline-flex items-center rounded-lg border border-mauve-6 px-1.5 py-0.5 text-body-secondary",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-mauve-12 text-mauve-1 shadow hover:bg-mauve-12/80 dark:bg-mauve-2 dark:text-mauve-12 dark:hover:bg-mauve-2/80",

				muted: "bg-muted border border-border/50",
				green: "bg-green-500/10 text-green-500 border-transparent",
				secondary:
					"border-transparent bg-mauve-3 text-mauve-12 hover:bg-mauve-3/80 dark:bg-mauve-3 dark:text-mauve-1 dark:hover:bg-mauve-3/80",
				outline: "text-mauve-12 dark:text-mauve-1",
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
