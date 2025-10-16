import type { ApiKey } from "@autumn/shared";
import { Delete } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteApiKeyDialog } from "./DeleteApiKeyDialog";

export const APIKeyToolbarItems = ({
	apiKey,
	isContextMenu = false,
	setDeleteOpen,
}: {
	apiKey: ApiKey;
	isContextMenu?: boolean;
	setDeleteOpen: (open: boolean) => void;
}) => {
	const MenuItem = isContextMenu ? ContextMenuItem : DropdownMenuItem;

	return (
		<>
			<MenuItem
				className="flex items-center"
				onClick={async (e) => {
					setDeleteOpen(true);
				}}
			>
				<div className="flex items-center justify-between w-full gap-2">
					Delete
					<Delete size={12} />
				</div>
			</MenuItem>
		</>
	);
};

export const APIKeyToolbar = ({
	apiKey,
	setDeleteOpen,
}: {
	apiKey: ApiKey;
	setDeleteOpen: (open: boolean) => void;
}) => {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<ToolbarButton />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="text-t2" align="end">
				<APIKeyToolbarItems apiKey={apiKey} setDeleteOpen={setDeleteOpen} />
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export const APIKeyContextMenu = ({
	apiKey,
	close,
}: {
	apiKey: ApiKey;
	close: () => void;
}) => {
	return (
		<ContextMenu>
			<ContextMenuTrigger className="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm">
				Right click here
			</ContextMenuTrigger>
			<ContextMenuContent className="w-52">
				<ContextMenuItem inset>
					Back
					{/* <ContextMenuShortcut>⌘[</ContextMenuShortcut> */}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
};
