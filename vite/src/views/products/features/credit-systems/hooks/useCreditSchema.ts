import type { CreditSchemaItem } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import type { CreditSystemFormInstance } from "./useCreditSystemForm";

export function useCreditSchema(form: CreditSystemFormInstance) {
	const config = useStore(form.store, (s) => s.values.config);
	const schema: CreditSchemaItem[] = config?.schema || [];

	return {
		schema,
		setSchema: (newSchema: CreditSchemaItem[]) =>
			form.setFieldValue("config", { ...config, schema: newSchema }),
		invoiceCredit: Boolean(config?.invoice_credit),
		setInvoiceCredit: (invoiceCredit: boolean) =>
			form.setFieldValue("config", {
				...config,
				invoice_credit: invoiceCredit,
			}),
	};
}
