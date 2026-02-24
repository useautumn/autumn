import { Sheet, SheetContent, SheetTitle } from "@/components/v2/sheets/Sheet";
import { MainSidebar } from "./MainSidebar";

export function MobileSidebar({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const close = () => onOpenChange(false);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				hideCloseButton
				portalContainer={document.body}
				className="w-[280px] max-w-[80vw] p-0 bg-outer-background"
				aria-describedby={undefined}
			>
				<SheetTitle className="sr-only">Navigation</SheetTitle>
				<MainSidebar onNavigate={close} />
			</SheetContent>
		</Sheet>
	);
}
