import { DropdownMenuGroup } from "@autumn/ui";
import { TableDropdownMenuCell } from "@/components/general/table";
import { AdminImpersonateMenuItem } from "./AdminImpersonateMenuItem";

export const AdminUserActionsCell = ({ userId }: { userId: string }) => (
	<div
		className="flex justify-end"
		onClick={(event) => event.stopPropagation()}
	>
		<TableDropdownMenuCell>
			<DropdownMenuGroup>
				<AdminImpersonateMenuItem userId={userId} />
			</DropdownMenuGroup>
		</TableDropdownMenuCell>
	</div>
);
