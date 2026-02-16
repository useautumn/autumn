"use client";

import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "../ui/dialog";
import { usePaywall } from "../../index";
import { cn } from "../../lib/utils";
import { getPaywallContent } from "./lib/paywall-content";

export interface PaywallDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	featureId: string;
	entityId?: string;
}

export default function PaywallDialog(params?: PaywallDialogProps) {
	const { data: preview } = usePaywall({
		featureId: params?.featureId,
		entityId: params?.entityId,
	});

	if (!params || !preview) {
		return <></>;
	}

	const { open, setOpen } = params;
	const { title, message } = getPaywallContent(preview);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="au-p-0 au-pt-4 au-gap-0 au-text-foreground au-overflow-hidden au-text-sm">
				<DialogTitle className={cn("au-font-bold au-text-xl au-px-6")}>
					{title}
				</DialogTitle>
				<div className="au-px-6 au-my-2">{message}</div>
				<DialogFooter className="au-flex au-flex-col sm:au-flex-row au-justify-between au-gap-x-4 au-py-2 au-mt-4 au-pl-6 au-pr-3 au-bg-secondary au-border-t">
					<Button
						size="sm"
						className="au-font-medium au-shadow au-transition au-min-w-20"
						onClick={async () => {
							setOpen(false);
						}}
					>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
