import { AppEnv } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useEnv } from "@/utils/envUtils";
import { useCurrentMembership } from "@/views/main-sidebar/org-dropdown/hooks/useCurrentMembership";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";

export const ApprovalsSection = () => {
	const { rules, isLoading, error } = useApprovalRulesQuery();
	const env = useEnv();
	const { isAdmin } = useCurrentMembership();

	return (
		<SettingsSection
			title="Approvals"
			description="Who can or can't make billing changes, and when."
			actions={
				// The rule editor sheet lands in U3b.
				<Button variant="primary" size="sm" disabled>
					New rule
				</Button>
			}
		>
			{isLoading ? (
				<Skeleton className="h-64 w-full" />
			) : (
				<ApprovalRulesList
					rules={rules}
					error={error}
					isSandbox={env === AppEnv.Sandbox}
					canEdit={isAdmin}
				/>
			)}
		</SettingsSection>
	);
};
