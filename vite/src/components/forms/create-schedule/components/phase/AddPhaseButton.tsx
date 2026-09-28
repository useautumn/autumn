import { PlusIcon } from "@phosphor-icons/react";

export function AddPhaseButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-table-tray-border text-sm text-tertiary-foreground transition-colors hover:border-primary hover:text-foreground"
		>
			<PlusIcon size={12} />
			Add phase
		</button>
	);
}
