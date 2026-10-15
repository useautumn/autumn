import { AppEnv } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useEnv } from "@/utils/envUtils";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";

export const ApprovalsSection = () => {
	const { rules, isLoading, error } = useApprovalRulesQuery();
	const env = useEnv();

	return (
		<SettingsSection
			title="Approvals"
			description="Who can make changes, and when. Rules only allow."
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
				/>
			)}
		</SettingsSection>
	);
};
