import { DialogClose } from "@autumn/ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export const EnvironmentDetailHeader = ({
	icon,
	title,
	subtitle,
}: {
	icon: ReactNode;
	title: string;
	subtitle?: string;
}) => (
	<div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b pr-3 pl-5">
		<div className="flex min-w-0 items-center gap-2.5">
			{icon}
			<span className="truncate text-sm font-semibold text-foreground">
				{title}
			</span>
			{subtitle && (
				<span className="shrink-0 text-xs text-tertiary-foreground">
					{subtitle}
				</span>
			)}
		</div>
		<DialogClose
			aria-label="Close"
			className="flex size-7 shrink-0 items-center justify-center rounded-md text-tertiary-foreground outline-none transition-colors duration-150 ease-out hover:bg-interactive-secondary-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
		>
			<X className="size-4" />
		</DialogClose>
	</div>
);
