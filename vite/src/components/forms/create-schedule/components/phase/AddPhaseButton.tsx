import { PlusIcon } from "@phosphor-icons/react";

export function AddPhaseButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group/add-phase flex h-8 w-fit cursor-pointer items-center gap-0.5 text-sm text-tertiary-foreground transition-colors hover:text-foreground"
		>
			<span className="flex w-8 shrink-0 justify-center">
				<span className="relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-tertiary-foreground bg-card transition-colors group-hover/add-phase:border-foreground">
					<PlusIcon size={9} weight="bold" />
				</span>
			</span>
			Add phase
		</button>
	);
}
