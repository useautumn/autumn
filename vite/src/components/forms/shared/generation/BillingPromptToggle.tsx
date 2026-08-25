import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { SparkleIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useBillingPromptVisibility } from "./useBillingPromptVisibility";

export function BillingPromptToggle() {
	const { visible, setVisible } = useBillingPromptVisibility();
	const label = visible ? "Hide assistant" : "Show assistant";

	// Each sheet opens with the assistant hidden until the user asks for it.
	useEffect(() => () => setVisible(false), [setVisible]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					type="button"
					variant="muted"
					size="sm"
					aria-pressed={visible}
					aria-label={label}
					onClick={() => setVisible(!visible)}
					icon={
						<SparkleIcon
							size={14}
							weight={visible ? "fill" : "regular"}
							className={cn(
								visible ? "text-primary" : "text-tertiary-foreground",
							)}
						/>
					}
				/>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
