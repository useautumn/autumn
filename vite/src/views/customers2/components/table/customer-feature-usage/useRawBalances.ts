import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";

export const useRawBalances = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const { customer_id } = useParams();
    const axiosInstance = useAxiosInstance();

    const fetcher = async () => {
        try {
            const { data } = await axiosInstance.get(`/v1/balances/list`, {
                params: { customer_id },
            });
            return data;
        } catch (error) {
            throwBackendError(error);
        }
    };

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["rawBalances", customer_id],
        queryFn: fetcher,
        enabled: enabled && !!customer_id,
        retry: false,
    });

    return {
        rawBalances: data?.balances ?? [],
        isLoading,
        error,
        refetch,
    };
};
