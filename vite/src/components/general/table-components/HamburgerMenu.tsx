import { InfoTooltip } from "../modal-components/InfoTooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EllipsisVertical } from "lucide-react";

export interface MenuAction {
	type: 'item' | 'sub';
	label: string;
	onClick?: () => void;
	tooltip?: string;
	children?: MenuAction[];
}

export const HamburgerMenu = ({
	dropdownOpen,
	setDropdownOpen,
	actions,
	triggerClassName,
	contentClassName,
	contentAlign = "end",
}: {
	dropdownOpen: boolean;
	setDropdownOpen: (open: boolean) => void;
	actions: MenuAction[];
	triggerClassName?: string;
	contentClassName?: string;
	contentAlign?: "start" | "center" | "end";
}) => {
	const renderMenuAction = (action: MenuAction) => {
		if (action.type === 'sub') {
			return (
				<DropdownMenuSub key={action.label}>
					<DropdownMenuSubTrigger className="flex items-center gap-2">
						{action.label}
						{action.tooltip && (
							<InfoTooltip>
								<p>{action.tooltip}</p>
							</InfoTooltip>
						)}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="min-w-52">
						{action.children?.map(renderMenuAction)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			);
		}

		return (
			<DropdownMenuItem
				key={action.label}
				onClick={() => {
					action.onClick?.();
					setDropdownOpen(false);
				}}
                className="cursor-pointer"
			>
				{action.label}
			</DropdownMenuItem>
		);
	};

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="add"
					disableStartIcon
					startIcon={<EllipsisVertical size={16} />}
					className={`w-10 h-10 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50 ${triggerClassName || ""}`}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={contentAlign} className={`min-w-36 ${contentClassName || ""}`}>
				{actions.map(renderMenuAction)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
