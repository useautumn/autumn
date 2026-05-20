import type { BillingChangeResponse } from "@autumn/shared";

const isEnabled = (): boolean => process.env.PRINT_BILLING_CHANGES === "1";

export const logChangeResponse = (
	label: string,
	response: BillingChangeResponse,
): void => {
	if (!isEnabled()) return;
	const divider = "─".repeat(Math.max(8, 60 - label.length));
	process.stdout.write(`\n── ${label} ${divider}\n`);
	process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
};
