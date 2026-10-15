import { Button } from "@autumn/ui";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";
import { ApprovalRuleSheet } from "./approvals/editor/ApprovalRuleSheet";
import { DeleteRuleDialog } from "./approvals/editor/DeleteRuleDialog";
import { useRuleDialogs } from "./approvals/editor/useRuleDialogs";

export const ApprovalsSection = () => {
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
			<ApprovalRulesList dialogs={dialogs} />
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
