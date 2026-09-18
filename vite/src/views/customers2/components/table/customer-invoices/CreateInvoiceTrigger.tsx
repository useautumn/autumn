import { Button } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

export function CreateInvoiceTrigger() {
	const setSheet = useSheetStore((s) => s.setSheet);

	return (
		<Button
			className="gap-2 font-medium"
			onClick={() => setSheet({ type: "create-invoice" })}
			size="mini"
			variant="secondary"
		>
			<PlusIcon className="size-3.5" />
			Create Invoice
		</Button>
	);
}
