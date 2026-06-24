import { Button } from "@autumn/ui/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@autumn/ui/components/ui/dropdown-menu";
import { EllipsisVertical } from "lucide-react";

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
