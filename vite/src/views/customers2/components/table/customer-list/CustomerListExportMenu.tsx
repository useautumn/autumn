import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CustomerExportSheet } from "../../export/CustomerExportSheet";

export function CustomerListExportMenu() {
	const [isSheetOpen, setIsSheetOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="secondary"
						size="icon"
						type="button"
						aria-label="More customer actions"
					>
						<DotsThreeIcon size={16} weight="bold" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setIsSheetOpen(true)}>
						Export customers
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CustomerExportSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} />
		</>
	);
}
