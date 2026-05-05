import { CheckIcon } from "@phosphor-icons/react";
import { CheckoutTerminalState } from "./CheckoutTerminalState";

export function CheckoutSuccessState() {
	return (
		<CheckoutTerminalState
			title="Purchase complete"
			message="Your order has been confirmed."
			Icon={CheckIcon}
			tone="primary"
		/>
	);
}
