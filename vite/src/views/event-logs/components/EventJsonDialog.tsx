import type { ApiEventsListItem } from "@autumn/shared";
import { CopyablePre, Dialog, DialogContent, DialogTitle } from "@autumn/ui";

export const EventJsonDialog = ({
	event,
	isOpen,
	setIsOpen,
}: {
	event: ApiEventsListItem;
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
}) => (
	<Dialog open={isOpen} onOpenChange={setIsOpen}>
		<DialogContent
			className="sm:max-w-[600px] p-2"
			aria-describedby={undefined}
		>
			<DialogTitle className="sr-only">Event JSON</DialogTitle>
			<CopyablePre text={JSON.stringify(event, null, 4)} />
		</DialogContent>
	</Dialog>
);
