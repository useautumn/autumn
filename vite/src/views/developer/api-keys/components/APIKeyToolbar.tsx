import type { ApiKey } from "@autumn/shared";
import { Delete } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteApiKeyDialog } from "./DeleteApiKeyDialog";

export const APIKeyToolbarItems = ({
	setDeleteOpen,
}: {
	setDeleteOpen: (open: boolean) => void;
}) => {
	return (
		<>
			<DropdownMenuItem
				className="flex items-center"
				onClick={() => {
					setDeleteOpen(true);
				}}
			>
				<div className="flex items-center justify-between w-full gap-2">
					Delete
					<Delete size={12} />
				</div>
			</DropdownMenuItem>
		</>
	);
};

export const APIKeyToolbar = ({ apiKey }: { apiKey: ApiKey }) => {
	const [deleteOpen, setDeleteOpen] = useState(false);

	return (
		<>
			<DeleteApiKeyDialog
				apiKey={apiKey}
				open={deleteOpen}
				setOpen={setDeleteOpen}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2" align="end">
					<APIKeyToolbarItems setDeleteOpen={setDeleteOpen} />
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
