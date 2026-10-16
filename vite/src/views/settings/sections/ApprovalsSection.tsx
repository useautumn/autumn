import { AppEnv } from "@autumn/shared";
import { Button, Skeleton } from "@autumn/ui";
import { useApprovalRulesQuery } from "@/hooks/queries/useApprovalRulesQuery";
import { useEnv } from "@/utils/envUtils";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";
import { ApprovalRuleSheet } from "./approvals/editor/ApprovalRuleSheet";
import { DeleteRuleDialog } from "./approvals/editor/DeleteRuleDialog";
import { useRuleDialogs } from "./approvals/editor/useRuleDialogs";

export const ApprovalsSection = () => {
	const { rules, isLoading, error } = useApprovalRulesQuery();
	const env = useEnv();
	const dialogs = useRuleDialogs();

	return (
		<SettingsSection
			title="Approvals"
			description="Who can make changes, and when. Rules only allow."
			actions={
				<Button
					variant="primary"
					size="sm"
					onClick={() => dialogs.openEditor({ rule: null })}
				>
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
					rowActions={{
						onEdit: (rule) => dialogs.openEditor({ rule }),
						onDelete: (rule) => dialogs.openDelete({ rule }),
					}}
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
