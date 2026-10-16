import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import type { ApprovalRule } from "./approvalsStub";
import type { RuleMove } from "./moveRule";

/** Everyone can open a rule; only editors get Edit and Delete. */
export type RuleRowActions = {
	canEdit: boolean;
	onOpen: (rule: ApprovalRule) => void;
	onDelete: (rule: ApprovalRule) => void;
};

const MOVES: { move: RuleMove; label: string; towardsTop: boolean }[] = [
	{ move: "up", label: "Move up", towardsTop: true },
	{ move: "down", label: "Move down", towardsTop: false },
	{ move: "top", label: "To top", towardsTop: true },
	{ move: "bottom", label: "To bottom", towardsTop: false },
];

export const RuleRowMenu = ({
	rule,
	actions,
	isFirst,
	isLast,
	onMove,
}: {
	rule: ApprovalRule;
	actions: RuleRowActions;
	isFirst: boolean;
	isLast: boolean;
	onMove: (move: RuleMove) => void;
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
				<>
					<DropdownMenuSeparator />
					{MOVES.map(({ move, label, towardsTop }) => (
						<DropdownMenuItem
							key={move}
							disabled={towardsTop ? isFirst : isLast}
							onClick={() => onMove(move)}
						>
							{label}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => actions.onDelete(rule)}
					>
						Delete rule
					</DropdownMenuItem>
				</>
			)}
		</DropdownMenuContent>
	</DropdownMenu>
);
