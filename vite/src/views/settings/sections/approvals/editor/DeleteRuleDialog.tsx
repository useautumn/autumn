import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useDeleteApprovalRule } from "@/hooks/queries/useApprovalRulesMutations";
import type { ApprovalRule } from "../approvalsStub";

export const DeleteRuleDialog = ({
	rule,
	open,
	onOpenChange,
}: {
	rule: ApprovalRule | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const remove = useDeleteApprovalRule();

	return (
		<Dialog
			open={open}
			// A delete in flight closes this dialog when it lands, so it can't close another one.
			onOpenChange={(next) => !remove.isPending && onOpenChange(next)}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Delete rule</DialogTitle>
					<DialogDescription className="break-words">
						Delete{" "}
						<span className="font-medium text-foreground">{rule?.name}</span>?
						Its version history is kept.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={remove.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						isLoading={remove.isPending}
						onClick={() =>
							rule &&
							remove.mutate(
								{ id: rule.id },
								{ onSuccess: () => onOpenChange(false) },
							)
						}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
