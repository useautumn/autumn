import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function AddPhaseButton({
	onClick,
	alignsWithRail,
}: {
	onClick: () => void;
	alignsWithRail: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group/add-phase flex h-8 w-fit items-center gap-3 text-sm text-tertiary-foreground transition-colors hover:text-foreground"
		>
			<span
				className={cn("flex shrink-0 justify-center", alignsWithRail && "w-2")}
			>
				<span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-tertiary-foreground bg-card transition-colors group-hover/add-phase:border-solid group-hover/add-phase:border-primary">
					<PlusIcon size={9} weight="bold" />
				</span>
			</span>
			Add phase
		</button>
	);
}
