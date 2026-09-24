import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	type CreateInvoiceForm,
	newInvoicePlan,
} from "../createInvoiceFormSchema";

export function useCreateInvoiceForm({
	defaultOverrides,
}: {
	defaultOverrides?: Partial<CreateInvoiceForm>;
} = {}) {
	// FormApi.update re-applies defaultValues on every render, so a fresh plan
	// id here would rewrite the store and loop.
	const [defaultValues] = useState<CreateInvoiceForm>(() => ({
		plans: [newInvoicePlan()],
		customLineItems: [],
		discounts: [],
		invoiceTemplateId: null,
		netTermsDays: null,
		taxRateId: null,
		periodStart: null,
		periodEnd: null,
		...defaultOverrides,
	}));

	return useAppForm({ defaultValues });
}

export type CreateInvoiceFormApi = ReturnType<typeof useCreateInvoiceForm>;
