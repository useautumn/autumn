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
	// Always null: idempotency keys live on the Idempotency-Key header, not the event row.
	const { idempotency_key: _idempotencyKey, ...eventData } = event;

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent
				className="sm:max-w-[600px] p-2"
				aria-describedby="Event Details"
			>
				<CopyablePre
					text={JSON.stringify(
						{
							...eventData,
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
