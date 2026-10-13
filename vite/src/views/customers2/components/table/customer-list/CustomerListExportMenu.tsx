import { CustomerExportKind } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
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
				<DropdownMenuTrigger
					render={
						<IconButton
							variant="secondary"
							className="btn-secondary-popup"
							rightIcon={
								<CaretDownIcon className="size-3 text-tertiary-foreground" />
							}
						/>
					}
				>
					Export
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{EXPORT_KINDS.map((kind) => {
						const { menuIcon: MenuIcon, menuLabel } =
							CUSTOMER_EXPORT_SHEET_COPY[kind];
						return (
							<DropdownMenuItem
								key={kind}
								className="flex gap-2"
								onClick={() => setSheet({ kind, open: true })}
							>
								<MenuIcon />
								{menuLabel}
							</DropdownMenuItem>
						);
					})}
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
