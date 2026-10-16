import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { useIsSettingsTabEnabled } from "@/views/settings/SettingsView";
import { RULE_EXEMPT_ROLES } from "../roles/roleAccess";
import { RulesThatIncludeBody } from "./RulesThatIncludeBody";
import type { RuleAudience } from "./rulesThatInclude";

/** Read-only list of the approval rules that reach a role or member, for their detail sheet. */
export const RulesThatIncludeSection = ({
	audience,
	name,
	roleLabel = null,
}: {
	audience: RuleAudience;
	name: string;
	roleLabel?: string | null;
}) => {
	const env = useEnv();
	const isTabEnabled = useIsSettingsTabEnabled();
	if (!isTabEnabled("approvals")) return null;

	const exempt =
		audience.role !== null && RULE_EXEMPT_ROLES.includes(audience.role);

	return (
		<section className="flex flex-col gap-2.5">
			<div className="flex items-center gap-3">
				<h3 className="font-semibold text-foreground text-sm">
					Approval rules that include {name}
				</h3>
				<Link
					to={getRedirectUrl("/settings?tab=approvals", env)}
					className="ml-auto flex items-center gap-0.5 font-medium text-tertiary-foreground text-xs hover:text-foreground"
				>
					Open Approvals
					<ArrowUpRightIcon className="size-3" />
				</Link>
			</div>
			{exempt ? (
				<p className="text-subtle text-xs">
					Owners and Admins are never limited by approval rules.
				</p>
			) : (
				<RulesThatIncludeBody
					audience={audience}
					name={name}
					roleLabel={roleLabel}
				/>
			)}
			<p className="text-subtle text-xs">
				Read only. Edit rules in Billing → Approvals.
			</p>
		</section>
	);
};
