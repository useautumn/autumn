import type { CustomButton } from "@autumn/shared";
import { ArrowSquareOutIcon, DotsThreeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import {
	isSafeCustomButtonUrl,
	resolveCustomButtonUrl,
} from "@/utils/linkUtils";

const MAX_INLINE_BUTTONS = 3;

export function CustomButtons({
	buttons,
	customer,
}: {
	buttons: CustomButton[];
	customer: { id?: string | null } | undefined;
}) {
	const [overflowOpen, setOverflowOpen] = useState(false);

	const openButton = (button: CustomButton) => {
		if (!customer) return;
		const resolved = resolveCustomButtonUrl(button.url, customer);
		if (!isSafeCustomButtonUrl(resolved)) {
			toast.error("This button has an invalid URL");
			return;
		}
		if (button.open_in_new_tab) {
			window.open(resolved, "_blank", "noopener");
		} else {
			window.location.href = resolved;
		}
	};

	if (buttons.length === 0) return null;

	const inlineButtons = buttons.slice(0, MAX_INLINE_BUTTONS);
	const overflowButtons = buttons.slice(MAX_INLINE_BUTTONS);

	return (
		<>
			{inlineButtons.map((button) => (
				<Button
					key={button.id}
					variant="secondary"
					size="sm"
					className="max-w-40 gap-1.5 text-xs font-normal text-tertiary-foreground hover:text-foreground"
					onClick={() => openButton(button)}
				>
					<span className="truncate">{button.label}</span>
					{button.open_in_new_tab && (
						<ArrowSquareOutIcon className="size-3 shrink-0 text-tertiary-foreground" />
					)}
				</Button>
			))}
			{overflowButtons.length > 0 && (
				<DropdownMenu open={overflowOpen} onOpenChange={setOverflowOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="secondary"
							size="sm"
							className="gap-1 text-xs font-normal text-tertiary-foreground hover:text-foreground"
						>
							<DotsThreeIcon className="size-4" />
							{overflowButtons.length}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="max-w-64">
						{overflowButtons.map((button) => (
							<DropdownMenuItem
								key={button.id}
								onClick={() => openButton(button)}
							>
								<span className="truncate">{button.label}</span>
								{button.open_in_new_tab && (
									<ArrowSquareOutIcon className="ml-auto size-3 shrink-0 text-tertiary-foreground" />
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</>
	);
}
