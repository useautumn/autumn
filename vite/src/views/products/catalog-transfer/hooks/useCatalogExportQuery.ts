import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Org- and sandbox-scoped, so a switch never serves the previous org's catalog. */
export const useCatalogExportQuery = ({ enabled }: { enabled: boolean }) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey(["catalog-v2-export"]),
		queryFn: () =>
			CatalogV2Service.get(axiosInstance, { include_versions: true }),
		enabled,
		staleTime: 0,
		retry: false,
	});
};
