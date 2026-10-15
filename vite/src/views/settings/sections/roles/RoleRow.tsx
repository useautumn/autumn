import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { EllipsisVertical } from "lucide-react";
import { LabelTag } from "@/components/general/LabelTag";
import {
	SETTINGS_ROW_CLASS,
	TableCell,
	TableRow,
} from "@/views/settings/SettingsTable";
import { canEditRole, type Role, summarizeAccess } from "./roleAccess";

export const RoleRow = ({
	role,
	onEdit,
	onDelete,
	readOnly,
}: {
	role: Role;
	onEdit: () => void;
	onDelete: () => void;
	readOnly: boolean;
}) => {
	const editable = !readOnly && canEditRole({ role });

	return (
		<TableRow className={SETTINGS_ROW_CLASS}>
			<TableCell className="pl-4">
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground">{role.label}</span>
					{role.built_in && <LabelTag label="Built-in" />}
				</div>
			</TableCell>
			<TableCell className="max-w-0 truncate">
				{summarizeAccess({ access: role.access })}
			</TableCell>
			<TableCell className="tabular-nums">{role.member_count}</TableCell>
			<TableCell className="pr-2">
				<div className="flex justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<IconButton
									variant="skeleton"
									size="icon"
									iconOrientation="center"
									icon={<EllipsisVertical />}
									aria-label={`${role.label} actions`}
									className="!size-5 rounded-lg hover:bg-interactive-secondary-hover"
								/>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={onEdit}>
								{editable ? "Edit role" : "View access"}
							</DropdownMenuItem>
							{editable && (
								<DropdownMenuItem variant="destructive" onClick={onDelete}>
									Delete role
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</TableCell>
		</TableRow>
	);
};
