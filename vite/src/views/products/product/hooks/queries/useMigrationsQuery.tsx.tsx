import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useMigrationsQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const fetchProductMigrations = async () => {
		const { data } = await axiosInstance.get("/products/migrations");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: buildKey(["migrations"]),
		queryFn: fetchProductMigrations,
		retry: false, // Don't retry on error
	});

	return { migrations: data?.migrations || [], isLoading, error, refetch };
};
