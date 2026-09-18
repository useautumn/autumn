import type { CommandOrg } from "./commandOrg.js";

/** Only the org settings a decision reads cross to the worker; the log records them with the command. */
export const orgToCommandOrg = ({
	org,
}: {
	org: { config: CommandOrg["config"] };
}): CommandOrg => ({
	config: {
		reverse_deduction_order: org.config.reverse_deduction_order,
		block_overdue_entitlements: org.config.block_overdue_entitlements,
		include_past_due: org.config.include_past_due,
	},
});
