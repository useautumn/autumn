import { CopyablePre } from "@/components/general/CopyablePre";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import type { IRow } from "./AGGrid";

export function RowClickDialog({
	event,
	isOpen,
	setIsOpen,
}: {
	event: IRow;
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
}) {
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogHeader>
				<DialogTitle className="text-xl font-bold tracking-tight">
					Event Details
				</DialogTitle>
			</DialogHeader>

			<DialogContent
				className="sm:max-w-[600px] p-2"
				aria-describedby="Event Details"
			>
				<CopyablePre
					text={JSON.stringify(
						{
							...event,
							properties: JSON.parse(event.properties),
						},
						null,
						4,
					)}
				/>
			</DialogContent>
		</Dialog>
	);
}
