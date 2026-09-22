import type { CommandOrg } from "./commandOrg.js";

type OrgLike = {
	id?: string;
	slug?: string;
	config: CommandOrg["config"];
	svix_config?: {
		sandbox_app_id?: string | null;
		live_app_id?: string | null;
	} | null;
};

/** What a log reader needs of the org; picked field by field so a secret can never ride along by accident. */
export const orgToCommandOrg = ({ org }: { org: OrgLike }): CommandOrg => ({
	id: org.id,
	slug: org.slug,
	config: {
		reverse_deduction_order: org.config.reverse_deduction_order,
		block_overdue_entitlements: org.config.block_overdue_entitlements,
		include_past_due: org.config.include_past_due,
		usage_alerts: org.config.usage_alerts,
		sandbox_usage_alerts: org.config.sandbox_usage_alerts,
	},
	svix: {
		sandbox_app_id: org.svix_config?.sandbox_app_id || null,
		live_app_id: org.svix_config?.live_app_id || null,
	},
});
