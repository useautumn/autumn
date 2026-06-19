import type { CustomButton } from "@autumn/shared";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { IconTooltipButton } from "@/components/v2/buttons/IconTooltipButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { PhosphorIcon } from "@/components/v2/icons/PhosphorIcon";
import {
	isSafeCustomButtonUrl,
	resolveCustomButtonUrl,
} from "@/utils/linkUtils";

const MAX_INLINE_BUTTONS = 8;

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
				<IconTooltipButton
					key={button.id}
					tooltip={button.label}
					icon={<PhosphorIcon name={button.icon} className="size-3.5" />}
					onClick={() => openButton(button)}
				/>
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
								<PhosphorIcon
									name={button.icon}
									className="size-4 shrink-0 text-tertiary-foreground"
								/>
								<span className="truncate">{button.label}</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</>
	);
}
