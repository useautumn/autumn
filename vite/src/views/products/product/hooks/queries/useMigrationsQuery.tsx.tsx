import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useQuery } from "@tanstack/react-query";

export const useMigrationsQuery = () => {
  const axiosInstance = useAxiosInstance();

  const fetchProductMigrations = async () => {
    const { data } = await axiosInstance.get("/products/migrations");
    return data;
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["migrations"],
    queryFn: fetchProductMigrations,
  });

  return { migrations: data?.migrations || [], isLoading, error, refetch };
};
