import { Button } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

export function CreateInvoiceTrigger() {
	const setSheet = useSheetStore((s) => s.setSheet);
	const canCreate = useCanDo(APPROVAL_OPENERS.createInvoice);
	if (!canCreate) return null;

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
