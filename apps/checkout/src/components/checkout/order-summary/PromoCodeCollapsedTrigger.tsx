import { PlusIcon } from "@phosphor-icons/react";

export function PromoCodeCollapsedTrigger({ onOpen }: { onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex h-9 items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<PlusIcon className="h-3.5 w-3.5" weight="bold" />
			Add promo code
		</button>
	);
}
