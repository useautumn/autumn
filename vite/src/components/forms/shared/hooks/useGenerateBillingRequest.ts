import { useMutation } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type GenerateBillingTool =
	| "attach"
	| "create_schedule"
	| "update_subscription";

export type GenerateBillingRequestResponse = {
	object: "billing_request_generation";
	tool: GenerateBillingTool;
	request: Record<string, unknown>;
	unrepresentable: string[];
};

export function useGenerateBillingRequest() {
	const axiosInstance = useAxiosInstance();

	return useMutation({
		mutationFn: async ({
			tool,
			prompt,
			customerId,
			customerProductId,
			currentRequest,
		}: {
			tool: GenerateBillingTool;
			prompt: string;
			customerId: string;
			customerProductId?: string;
			currentRequest?: Record<string, unknown>;
		}) => {
			const { data } = await axiosInstance.post<GenerateBillingRequestResponse>(
				"/v1/agent.generate_billing_request",
				{
					customer_id: customerId,
					prompt,
					tool,
					...(customerProductId
						? { customer_product_id: customerProductId }
						: {}),
					...(currentRequest ? { current_request: currentRequest } : {}),
				},
			);
			return data;
		},
	});
}
