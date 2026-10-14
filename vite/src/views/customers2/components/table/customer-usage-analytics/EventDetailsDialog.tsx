import type { Event } from "@autumn/shared";
import {
	CopyablePre,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";

export function EventDetailsDialog({
	event,
	open,
	setOpen,
}: {
	event: Event | null;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	if (!event) return null;

	const properties =
		typeof event.properties === "string"
			? JSON.parse(event.properties)
			: event.properties;

	const { idempotency_key: _idempotencyKey, ...rest } = event;

	const eventData = {
		...rest,
		properties,
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-xl [&>*]:min-w-0">
				<DialogHeader>
					<DialogTitle>Event Details</DialogTitle>
				</DialogHeader>
				<CopyablePre text={JSON.stringify(eventData, null, 2)} />
			</DialogContent>
		</Dialog>
	);
}
