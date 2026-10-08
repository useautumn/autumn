import { useState } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	type CreateInvoiceForm,
	newInvoicePlan,
} from "../createInvoiceFormSchema";

export function useCreateInvoiceForm({
	defaultEntityId = null,
	defaultOverrides,
}: {
	defaultEntityId?: string | null;
	defaultOverrides?: Partial<CreateInvoiceForm>;
} = {}) {
	// FormApi.update re-applies defaultValues on every render, so a fresh plan
	// id here would rewrite the store and loop.
	const [defaultValues] = useState<CreateInvoiceForm>(() => ({
		plans: [newInvoicePlan({ entityId: defaultEntityId })],
		customLineItems: [],
		discounts: [],
		invoiceTemplateId: null,
		netTermsDays: null,
		taxRateId: null,
		periodStart: null,
		periodEnd: null,
		issueDay: null,
		...defaultOverrides,
	}));

	return useAppForm({ defaultValues });
}

export type CreateInvoiceFormApi = ReturnType<typeof useCreateInvoiceForm>;
