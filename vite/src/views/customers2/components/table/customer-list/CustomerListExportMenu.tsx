import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
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
					<Button
						variant="skeleton"
						size="icon"
						type="button"
						aria-label="More customer actions"
					>
						<EllipsisVertical size={16} />
					</Button>
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
