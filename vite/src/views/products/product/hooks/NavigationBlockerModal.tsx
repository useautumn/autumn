import React from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NavigationBlockerModalProps {
	isOpen: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export const NavigationBlockerModal: React.FC<NavigationBlockerModalProps> = ({
	isOpen,
	onConfirm,
	onCancel,
}) => {
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Unsaved Changes</DialogTitle>
					<DialogDescription>
						Are you sure you want to leave without updating the product? Your
						changes will be lost.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						Leave Page
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
