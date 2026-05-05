import {
	CheckIcon,
	TimerIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { CheckoutTerminalState } from "./CheckoutTerminalState";

const variantConfig = {
	completed: { Icon: CheckIcon, tone: "muted" },
	expired: { Icon: TimerIcon, tone: "muted" },
	unavailable: { Icon: WarningIcon, tone: "muted" },
	generic: { Icon: WarningIcon, tone: "destructive" },
} as const;

export function CheckoutErrorState({
	title,
	message,
	variant,
}: {
	title: string;
	message: string;
	variant: keyof typeof variantConfig;
}) {
	const { Icon, tone } = variantConfig[variant];

	return (
		<CheckoutTerminalState
			title={title}
			message={message}
			Icon={Icon}
			tone={tone}
		/>
	);
}
