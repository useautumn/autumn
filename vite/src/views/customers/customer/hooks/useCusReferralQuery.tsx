import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export const useCusReferralQuery = () => {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const referralFetcher = async () => {
		console.log("referralFetcher");
		const { data } = await axiosInstance.get(
			`/customers/${customer_id}/referrals`,
		);

		return data;
	};

	const {
		data: cusRewardData,
		isLoading: cusRewardLoading,
		error: cusRewardError,
		refetch: cusRewardRefetch,
	} = useQuery({
		queryKey: ["customer_referrals", env, customer_id],
		queryFn: referralFetcher,
		retry: false,
	});

	return {
		stripeCus: cusRewardData?.stripeCus,

		redeemed: cusRewardData?.redeemed,
		referred: cusRewardData?.referred,
		cusRewardLoading,
		cusRewardError,
		cusRewardRefetch,
	};
};
