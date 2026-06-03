import type { InvoiceTemplate } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useInvoiceTemplatesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const fetchInvoiceTemplates = async () => {
		const { data } = await axiosInstance.get("/invoice_templates");
		return data;
	};
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["invoice-templates"]),
		queryFn: fetchInvoiceTemplates,
	});
	return {
		templates: (data?.templates ?? []) as InvoiceTemplate[],
		isLoading,
		error,
		refetch,
	};
};
