import { Button } from "@autumn/ui";
import { SettingsSection } from "../SettingsSection";
import { ApprovalRulesList } from "./approvals/ApprovalRulesList";

export const ApprovalsSection = () => (
	<SettingsSection
		title="Approvals"
		description="Who can make changes, and when. Rules only allow."
		actions={
			// The rule editor sheet lands in U3b; until then rules come from the mock.
			<Button variant="primary" size="sm" disabled>
				New rule
			</Button>
		}
	>
		<ApprovalRulesList />
	</SettingsSection>
);
