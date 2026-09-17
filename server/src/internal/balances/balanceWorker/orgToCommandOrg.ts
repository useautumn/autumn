import type { CommandOrg } from "@autumn/balance-engine";

/** Only the org settings a deduction reads cross to the worker; the log records them with the command. */
export function orgToCommandOrg({
	org,
}: {
	org: { config: CommandOrg["config"] };
}): CommandOrg {
	return {
		config: {
			reverse_deduction_order: org.config.reverse_deduction_order,
			block_overdue_entitlements: org.config.block_overdue_entitlements,
			include_past_due: org.config.include_past_due,
		},
	};
}
