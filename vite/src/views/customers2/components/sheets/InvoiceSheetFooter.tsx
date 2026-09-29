import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type InvoiceSheetAction = {
	label: string;
	icon: ReactNode;
	onSelect: () => void;
	destructive?: boolean;
	disabled?: boolean;
	isLoading?: boolean;
};

export function InvoiceSheetFooter({
	primaryAction,
	menuActions,
}: {
	primaryAction?: InvoiceSheetAction;
	menuActions: InvoiceSheetAction[];
}) {
	const safeActions = menuActions.filter((action) => !action.destructive);
	const destructiveActions = menuActions.filter((action) => action.destructive);

	return (
		<div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-card p-4 dark:border-[#1F1F1F] dark:bg-[#141414]">
			{menuActions.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="secondary"
							aria-label="More invoice actions"
							className="w-[30px] !px-0"
						>
							<DotsThreeIcon size={15} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" side="top" className="min-w-52">
						{safeActions.map((action) => (
							<InvoiceSheetMenuItem key={action.label} action={action} />
						))}
						{safeActions.length > 0 && destructiveActions.length > 0 && (
							<DropdownMenuSeparator />
						)}
						{destructiveActions.map((action) => (
							<InvoiceSheetMenuItem key={action.label} action={action} />
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
			{primaryAction && (
				<Button
					variant="primary"
					className="flex-1"
					onClick={primaryAction.onSelect}
					disabled={primaryAction.disabled}
					isLoading={primaryAction.isLoading}
				>
					{primaryAction.icon}
					{primaryAction.label}
				</Button>
			)}
		</div>
	);
}

function InvoiceSheetMenuItem({ action }: { action: InvoiceSheetAction }) {
	return (
		<DropdownMenuItem
			variant={action.destructive ? "destructive" : "default"}
			className={cn("text-[13px]", action.destructive && "dark:text-[#F2555A]")}
			disabled={action.disabled}
			onClick={action.onSelect}
		>
			{action.icon}
			{action.label}
		</DropdownMenuItem>
	);
}
