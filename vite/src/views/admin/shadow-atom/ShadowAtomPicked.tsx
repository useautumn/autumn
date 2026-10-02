import { X } from "lucide-react";

/** The picked org or customer, by name, with a way to pick again. */
export const ShadowAtomPicked = ({
	title,
	subtitle,
	onClear,
	clearLabel,
}: {
	title: string;
	subtitle: string;
	onClear: () => void;
	clearLabel: string;
}) => (
	<div className="flex h-8 min-w-0 items-center gap-2 rounded-md border bg-background px-2.5">
		<span className="truncate text-xs font-medium text-foreground">
			{title}
		</span>
		<span className="truncate font-mono text-[11px] text-tertiary-foreground">
			{subtitle}
		</span>
		<button
			type="button"
			aria-label={clearLabel}
			onClick={onClear}
			className="ml-auto text-tertiary-foreground hover:text-foreground"
		>
			<X className="size-3.5" />
		</button>
	</div>
);
