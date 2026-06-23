import { CopyablePre, Dialog, DialogContent } from "@autumn/ui";
import type { IRow } from "./analytics-types";

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
