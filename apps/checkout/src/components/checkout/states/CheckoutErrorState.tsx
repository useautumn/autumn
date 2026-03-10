import {
	CheckIcon,
	TimerIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { CheckoutTerminalState } from "./CheckoutTerminalState";

export function CheckoutErrorState({
	title,
	message,
	variant,
}: {
	title: string;
	message: string;
	variant: "completed" | "expired" | "unavailable" | "generic";
}) {
	const Icon =
		variant === "completed"
			? CheckIcon
			: variant === "expired"
				? TimerIcon
				: WarningIcon;

	return (
		<CheckoutTerminalState
			title={title}
			message={message}
			Icon={Icon}
			iconClassName={variant === "generic" ? "text-destructive/85" : undefined}
		/>
	);
}
