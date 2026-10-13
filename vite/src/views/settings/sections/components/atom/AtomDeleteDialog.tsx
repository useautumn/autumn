import {
	Button,
	CopyButton,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import { useState } from "react";

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
			"Autumn removes what has been deployed, then asks you to delete its stack in AWS.",
		keepLabel: "Keep deploying",
	},
	delete: {
		title: "Delete Atom?",
		description:
			"Autumn removes Atom's machine, disk and load balancer, then asks you to delete its stack in AWS. Checks fall back to the Autumn API straight away.",
		keepLabel: "Keep Atom",
	},
} satisfies Record<string, AtomDeletePrompt>;

/** Deleting tears down the org's infra, so the stack name is typed to confirm. */
export const AtomDeleteDialog = ({
	prompt,
	stackName,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	/** Null keeps the dialog closed. */
	prompt: AtomDeletePrompt | null;
	stackName: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => {
	const [typedName, setTypedName] = useState("");
	const close = (open: boolean) => {
		if (!open) setTypedName("");
		onOpenChange(open);
	};
	return (
		<Dialog open={prompt !== null} onOpenChange={close}>
			<DialogContent className="max-w-[440px]">
				<DialogHeader>
					<DialogTitle>{prompt?.title}</DialogTitle>
					<DialogDescription>{prompt?.description}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5 text-xs text-tertiary-foreground">
					<span className="flex min-w-0 items-center gap-1">
						Type
						<CopyButton
							text={stackName}
							variant="skeleton"
							className="h-6 min-w-0 px-1 font-mono text-xs text-foreground"
						/>
						to confirm
					</span>
					<Input
						aria-label="Stack name"
						className="font-mono text-xs"
						placeholder={stackName}
						value={typedName}
						onChange={(event) => setTypedName(event.target.value)}
					/>
				</div>
				<DialogFooter className="grid grid-cols-2">
					<Button
						variant="secondary"
						className="w-full"
						onClick={() => close(false)}
					>
						{prompt?.keepLabel}
					</Button>
					<Button
						variant="destructive"
						className="w-full"
						onClick={onConfirm}
						disabled={typedName.trim() !== stackName}
						isLoading={isDeleting}
					>
						Delete Atom
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
