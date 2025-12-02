import type { Event } from "@autumn/shared";
import { CopyablePre } from "@/components/general/CopyablePre";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

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

	// Parse properties if it's a string
	const properties =
		typeof event.properties === "string"
			? JSON.parse(event.properties)
			: event.properties;

	const eventData = {
		...event,
		properties,
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Event Details</DialogTitle>
				</DialogHeader>
				<CopyablePre text={JSON.stringify(eventData, null, 2)} />
			</DialogContent>
		</Dialog>
	);
}
