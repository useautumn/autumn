import { CheckoutParams } from "autumn-js";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { toSnakeCase } from "@/utils/formatUtils/formatUtils";

const cusData = {
	customer_id: "demo_123",
	customer_data: {
		name: "Demo Customer",
		email: "demo@example.com",
	},
};

export const useCustomerReplica = () => {
	const axiosInstance = useAxiosInstance();

	const checkout = async (params: any) => {
		try {
			const { data } = await axiosInstance.post("/v1/checkout", {
				...cusData,
				...toSnakeCase(params),
			});

			if (data.url) {
				window.open(data.url, "_blank");
			}
			return data;
		} catch (error: any) {
			toast.error(`Failed to checkout: ${error.message}`);
			return null;
		}
	};

	return {
		checkout,
	};
};
