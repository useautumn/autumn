import { AppEnv } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useEnv } from "@/utils/envUtils";
import { useCurrentMembership } from "@/views/main-sidebar/org-dropdown/hooks/useCurrentMembership";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";
import { ApprovalRuleSheet } from "./approvals/editor/ApprovalRuleSheet";
import { DeleteRuleDialog } from "./approvals/editor/DeleteRuleDialog";
import { useRuleDialogs } from "./approvals/editor/useRuleDialogs";

export const ApprovalsSection = () => {
	const { rules, isLoading, error } = useApprovalRulesQuery();
	const env = useEnv();
	const { isAdmin } = useCurrentMembership();
	const dialogs = useRuleDialogs();

	return (
		<SettingsSection
			title="Approvals"
			description="Who can or can't make billing changes, and when."
			actions={
				isAdmin && (
					<Button
						variant="primary"
						size="sm"
						onClick={() => dialogs.openEditor({ rule: null })}
					>
						New rule
					</Button>
				)
			}
		>
			{isLoading ? (
				<Skeleton className="h-64 w-full" />
			) : (
				<ApprovalRulesList
					rules={rules}
					error={error}
					isSandbox={env === AppEnv.Sandbox}
					rowActions={
						isAdmin
							? {
									onEdit: (rule) => dialogs.openEditor({ rule }),
									onDelete: (rule) => dialogs.openDelete({ rule }),
								}
							: null
					}
				/>
			)}
			<ApprovalRuleSheet
				key={dialogs.nonce}
				rule={dialogs.rule}
				open={dialogs.dialog === "editor"}
				onOpenChange={dialogs.setOpen}
			/>
			<DeleteRuleDialog
				rule={dialogs.rule}
				open={dialogs.dialog === "delete"}
				onOpenChange={dialogs.setOpen}
			/>
		</SettingsSection>
	);
};
