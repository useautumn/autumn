import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAdmin } from "./useAdmin";

interface MasterStripeAccount {
	id: string;
}

export const useMasterStripeAccount = () => {
	const axiosInstance = useAxiosInstance();
	const { isAdmin } = useAdmin();

	const fetchMasterStripeAccount = async () => {
		const { data } = await axiosInstance.get<MasterStripeAccount>(
			"/admin/master-stripe-account",
		);

		return data;
	};

	const { data, isLoading, error } = useQuery<MasterStripeAccount | null>({
		queryKey: ["admin", "master-stripe-account"],
		queryFn: fetchMasterStripeAccount,
		retry: false,
		enabled: isAdmin,
	});

	return {
		masterStripeAccount: data || null,
		isLoading,
		error,
	};
};
