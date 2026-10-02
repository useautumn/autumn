import { X } from "lucide-react";

/** The picked org, by name, with a way to pick again. */
export const ShadowAtomPicked = ({
	title,
	subtitle,
	onClear,
	clearLabel,
	disabled = false,
}: {
	title: string;
	subtitle: string;
	onClear: () => void;
	clearLabel: string;
	disabled?: boolean;
}) => (
	<div className="flex h-8 min-w-0 items-center gap-2 rounded-md border bg-background px-2.5">
		<span
			className="truncate text-xs font-medium text-foreground"
			title={title}
		>
			{title}
		</span>
		<span
			className="truncate font-mono text-[11px] text-tertiary-foreground"
			title={subtitle}
		>
			{subtitle}
		</span>
		<button
			type="button"
			aria-label={clearLabel}
			onClick={onClear}
			disabled={disabled}
			className="ml-auto text-tertiary-foreground hover:text-foreground"
		>
			<X className="size-3.5" />
		</button>
	</div>
);
