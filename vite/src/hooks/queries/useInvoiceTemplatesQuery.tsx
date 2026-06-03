import type { InvoiceTemplate } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useInvoiceTemplatesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["invoice-templates"]),
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				templates: InvoiceTemplate[];
			}>("/invoice_templates");
			return data;
		},
	});
	return {
		templates: data?.templates ?? [],
		isLoading,
		error,
		refetch,
	};
};
