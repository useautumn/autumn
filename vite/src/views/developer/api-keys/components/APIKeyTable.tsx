import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useState } from "react";

import { APIKeyToolbar, APIKeyToolbarItems } from "./APIKeyToolbar";
import { Item, Row } from "@/components/general/TableGrid";
import { ApiKey } from "@autumn/shared";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DeleteApiKeyDialog } from "./DeleteApiKeyDialog";

export const APIKeyTable = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
	const [openKeyId, setOpenKeyId] = useState<string | null>(null);

	return (
		<div>
			<Row type="header" className="grid-cols-18">
				<Item className="col-span-5">Name</Item>
				<Item className="col-span-10">Preview</Item>
				<Item className="col-span-2">Created At</Item>
				<Item className="col-span-1"></Item>
			</Row>
			{apiKeys.map((key) => (
				<APIKeyRow apiKey={key} />
			))}
		</div>
	);
};

export const APIKeyRow = ({ apiKey }: { apiKey: ApiKey }) => {
	const [openKeyId, setOpenKeyId] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	return (
		<ContextMenu
			key={apiKey.id}
			onOpenChange={(open) => setOpenKeyId(open ? apiKey.id : null)}
		>
			<ContextMenuTrigger>
				<Row
					className={
						openKeyId === apiKey.id
							? "grid-cols-18 bg-table-hover"
							: "grid-cols-18"
					}
				>
					<DeleteApiKeyDialog
						apiKey={apiKey}
						setOpen={setDeleteOpen}
						open={deleteOpen}
					/>
					<Item className="col-span-5 font-normal">{apiKey.name}</Item>
					<Item className="col-span-10 font-mono text-t2">{apiKey.prefix}</Item>
					<Item className="col-span-2 text-t3 text-xs">
						{formatUnixToDateTime(apiKey.created_at).date}
					</Item>
					<Item className="col-span-1 justify-end">
						<APIKeyToolbar apiKey={apiKey} setDeleteOpen={setDeleteOpen} />
					</Item>
				</Row>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<APIKeyToolbarItems
					apiKey={apiKey}
					isContextMenu={true}
					setDeleteOpen={setDeleteOpen}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
};
