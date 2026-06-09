import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useInvoiceTemplatesQuery } from "@/hooks/queries/useInvoiceTemplatesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { InvoiceTemplateForm } from "./invoiceTemplateFormSchema";

export function useInvoiceTemplates() {
	const axiosInstance = useAxiosInstance();
	const { templates, refetch } = useInvoiceTemplatesQuery();
	const save = useMutation({
		mutationFn: ({
			id,
			values,
		}: {
			id: string | null;
			values: InvoiceTemplateForm;
		}) =>
			id
				? axiosInstance.patch(`/invoice_templates/${id}`, values)
				: axiosInstance.post("/invoice_templates", values),
		onSuccess: (_data, { id }) => {
			refetch();
			toast.success(id ? "Invoice template updated" : "Invoice template added");
		},
		onError: () => toast.error("Failed to save invoice template"),
	});
	const remove = useMutation({
		mutationFn: (id: string) =>
			axiosInstance.delete(`/invoice_templates/${id}`),
		onSuccess: () => {
			refetch();
			toast.success("Invoice template removed");
		},
		onError: () => toast.error("Failed to remove invoice template"),
	});
	return { templates, save, remove };
}
