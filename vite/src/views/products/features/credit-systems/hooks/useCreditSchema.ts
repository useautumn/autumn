import type { CreditSchemaItem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { toast } from "sonner";
import { useCreditSchemaList } from "./useCreditSchemaList";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

export function useCreditSchema(form: CreditSystemFormInstance) {
	const config = useStore(form.store, (s) => s.values.config);
	const schema: CreditSchemaItem[] = config?.schema || [];

	const setSchema = (newSchema: CreditSchemaItem[]) =>
		form.setFieldValue("config", { ...config, schema: newSchema });

	const list = useCreditSchemaList({
		schema,
		onChange: setSchema,
		onRemoveLast: () =>
			toast.error("There must be at least one item in the credit system"),
	});

	return {
		schema,
		setSchema,
		invoiceCredit: Boolean(config?.invoice_credit),
		setInvoiceCredit: (invoiceCredit: boolean) =>
			form.setFieldValue("config", {
				...config,
				invoice_credit: invoiceCredit,
			}),
		...list,
	};
}
