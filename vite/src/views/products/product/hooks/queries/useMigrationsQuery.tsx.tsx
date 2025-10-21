import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useMigrationsQuery = () => {
	const axiosInstance = useAxiosInstance();

	const fetchProductMigrations = async () => {
		const { data } = await axiosInstance.get("/products/migrations");
		return data;
	};

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["migrations"],
		queryFn: fetchProductMigrations,
		retry: false, // Don't retry on error
	});

	return { migrations: data?.migrations || [], isLoading, error, refetch };
};
