import type { InvoiceTemplate } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useInvoiceTemplatesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const { org } = useOrg();
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["invoice-templates", org?.id],
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
