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

export function CustomerListExportMenu() {
	const [isSheetOpen, setIsSheetOpen] = useState(false);

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
					<DropdownMenuItem onClick={() => setIsSheetOpen(true)}>
						Export customers
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CustomerExportSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} />
		</>
	);
}
