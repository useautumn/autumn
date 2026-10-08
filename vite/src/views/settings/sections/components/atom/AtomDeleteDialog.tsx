import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";

export type AtomDeletePrompt = {
	title: string;
	description: string;
	keepLabel: string;
};

/** Cancelling a deploy and deleting a live Atom are the same delete; only what the org is told differs. */
export const ATOM_DELETE_PROMPTS = {
	cancel: {
		title: "Cancel deployment?",
		description:
			"We delete this Atom; then you delete its stack in AWS to finish.",
		keepLabel: "Keep deploying",
	},
	delete: {
		title: "Delete Atom?",
		description:
			"We remove Atom's machine, then you delete its stack in AWS to finish.",
		keepLabel: "Keep Atom",
	},
} satisfies Record<string, AtomDeletePrompt>;

export const AtomDeleteDialog = ({
	prompt,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	/** Null keeps the dialog closed. */
	prompt: AtomDeletePrompt | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => (
	<Dialog open={prompt !== null} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-[400px]">
			<DialogHeader>
				<DialogTitle>{prompt?.title}</DialogTitle>
				<DialogDescription>{prompt?.description}</DialogDescription>
			</DialogHeader>
			<DialogFooter className="grid grid-cols-2">
				<Button variant="secondary" onClick={() => onOpenChange(false)}>
					{prompt?.keepLabel}
				</Button>
				<Button
					variant="destructive"
					onClick={onConfirm}
					isLoading={isDeleting}
				>
					Delete Atom
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
