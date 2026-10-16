import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import type { ApprovalRule } from "./approvalsStub";

/** Everyone can open a rule; only editors get Edit and Delete. */
export type RuleRowActions = {
	canEdit: boolean;
	onOpen: (rule: ApprovalRule) => void;
	onDelete: (rule: ApprovalRule) => void;
};

export const RuleRowMenu = ({
	rule,
	actions,
}: {
	rule: ApprovalRule;
	actions: RuleRowActions;
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger
			render={
				<IconButton
					variant="skeleton"
					size="icon"
					iconOrientation="center"
					icon={<DotsThreeIcon />}
					aria-label={`${rule.name} actions`}
				/>
			}
		/>
		<DropdownMenuContent align="end">
			<DropdownMenuItem onClick={() => actions.onOpen(rule)}>
				{actions.canEdit ? "Edit rule" : "View rule"}
			</DropdownMenuItem>
			{actions.canEdit && (
				<DropdownMenuItem
					variant="destructive"
					onClick={() => actions.onDelete(rule)}
				>
					Delete rule
				</DropdownMenuItem>
			)}
		</DropdownMenuContent>
	</DropdownMenu>
);
