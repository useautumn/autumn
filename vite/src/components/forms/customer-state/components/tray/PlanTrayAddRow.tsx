import { PlusIcon } from "@phosphor-icons/react";

export function PlanTrayAddRow({
	label,
	disabled,
	onClick,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex h-8 w-fit cursor-pointer items-center gap-2 px-2 text-sm text-tertiary-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
		>
			<PlusIcon size={12} />
			{label}
		</button>
	);
}
