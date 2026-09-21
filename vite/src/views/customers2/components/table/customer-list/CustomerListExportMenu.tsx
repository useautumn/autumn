import { CustomerExportKind } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";
import { CustomerExportSheet } from "../../export/CustomerExportSheet";
import { CUSTOMER_EXPORT_SHEET_COPY } from "../../export/customerExportSheetCopy";

const EXPORT_KINDS = Object.values(CustomerExportKind);

export function CustomerListExportMenu() {
	// The kind outlives `open` so the sheet keeps its copy while animating out.
	const [sheet, setSheet] = useState<{
		kind: CustomerExportKind;
		open: boolean;
	}>({ kind: CustomerExportKind.Customers, open: false });

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton
						icon={<EllipsisVertical />}
						variant="skeleton"
						size="default"
						iconOrientation="center"
						className="!h-7"
						type="button"
						aria-label="More customer actions"
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{EXPORT_KINDS.map((kind) => (
						<DropdownMenuItem
							key={kind}
							onClick={() => setSheet({ kind, open: true })}
						>
							{CUSTOMER_EXPORT_SHEET_COPY[kind].menuLabel}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<CustomerExportSheet
				kind={sheet.kind}
				open={sheet.open}
				onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
			/>
		</>
	);
}
