import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";

const CONFIRM_TEXT = "confirm";

interface ConfirmBatchVersionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	productIds: string[];
	onConfirm: () => Promise<void>;
}

export function ConfirmBatchVersionDialog({
	open,
	onOpenChange,
	productIds,
	onConfirm,
}: ConfirmBatchVersionDialogProps) {
	const [confirmText, setConfirmText] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const isValid = confirmText.trim() === CONFIRM_TEXT;

	const handleConfirm = async () => {
		if (!isValid) return;
		setIsLoading(true);
		try {
			await onConfirm();
			onOpenChange(false);
		} finally {
			setIsLoading(false);
			setConfirmText("");
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setConfirmText("");
		}
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create new versions?</DialogTitle>
					<DialogDescription className="text-sm flex flex-col gap-4">
						<p>
							The following plans have active customers and will create{" "}
							<span className="font-bold">new versions</span>:
						</p>
						<ul className="list-disc pl-5 space-y-1">
							{productIds.map((productId) => (
								<li key={productId}>
									<code className="font-bold">{productId}</code>
								</li>
							))}
						</ul>
						<p>
							Type <code className="font-bold">{CONFIRM_TEXT}</code> to continue.
						</p>
						<Input
							value={confirmText}
							onChange={(e) => setConfirmText(e.target.value)}
							type="text"
							placeholder={CONFIRM_TEXT}
							className="w-full"
						/>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button variant="secondary" onClick={() => handleOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleConfirm}
						isLoading={isLoading}
						disabled={!isValid}
					>
						Create new versions
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
