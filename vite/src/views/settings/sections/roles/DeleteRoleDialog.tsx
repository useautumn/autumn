import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import type { Role } from "./roleAccess";

const memberCopy = ({ count }: { count: number }) =>
	count === 1 ? "1 member" : `${count} members`;

export const DeleteRoleDialog = ({
	role,
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
	inUseCount,
}: {
	role: Role | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
	inUseCount: number | null;
}) => (
	<Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-md">
			<DialogHeader>
				<DialogTitle>Delete role</DialogTitle>
				<DialogDescription className="break-words">
					Delete{" "}
					<span className="font-medium text-foreground">{role?.label}</span>?
					This can't be undone.
				</DialogDescription>
			</DialogHeader>
			{inUseCount !== null && (
				<p className="text-sm text-destructive">
					{role?.label} is assigned to {memberCopy({ count: inUseCount })}. Move
					them to another role, then delete it.
				</p>
			)}
			<DialogFooter>
				<Button
					variant="secondary"
					onClick={() => onOpenChange(false)}
					disabled={isDeleting}
				>
					Cancel
				</Button>
				<Button
					variant="destructive"
					onClick={onConfirm}
					isLoading={isDeleting}
					disabled={inUseCount !== null}
				>
					Delete
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
