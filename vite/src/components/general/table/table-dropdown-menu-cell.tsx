import { Button } from "@autumn/ui";
import { EllipsisVertical } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@autumn/ui";

export function TableDropdownMenuCell({
	children,
}: {
	children: React.ReactNode;
}) {
	if (!children) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="skeleton"
					size="icon"
					className="p-0 size-4"
					onClick={(e) => e.stopPropagation()}
				>
					<EllipsisVertical size={12} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>{children}</DropdownMenuContent>
		</DropdownMenu>
	);
}
