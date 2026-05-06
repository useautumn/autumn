import { CheckIcon, XIcon } from "@phosphor-icons/react";

export function PromoCodeAppliedRow({
	code,
	onRemove,
	disabled,
}: {
	code: string;
	onRemove: () => void;
	disabled: boolean;
}) {
	return (
		<div className="flex h-9 items-center justify-between gap-2 text-sm">
			<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
				<CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" weight="bold" />
				<span className="truncate">
					<span className="font-medium text-foreground">{code}</span> applied
				</span>
			</span>
			<button
				type="button"
				className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
				onClick={onRemove}
				disabled={disabled}
			>
				<XIcon className="h-3 w-3" weight="bold" />
				Remove
			</button>
		</div>
	);
}
