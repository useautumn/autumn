import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InlineActionProps extends ComponentProps<"button"> {
	icon?: ReactNode;
}

export function InlineAction({
	icon,
	children,
	className,
	...props
}: InlineActionProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex items-center gap-1 text-xs text-t4 hover:text-t2 transition-colors py-1 disabled:opacity-40 disabled:pointer-events-none",
				className,
			)}
			{...props}
		>
			{icon}
			{children}
		</button>
	);
}
