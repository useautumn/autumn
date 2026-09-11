import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { impersonateUser } from "../adminUtils";
import { useAdmin } from "./useAdmin";

export type ImpersonatableOrg = {
	id: string;
	name: string;
	slug: string;
};

/** Search customer orgs and switch the staff session into one of them (reloads the page). */
export const useImpersonateOrg = () => {
	const axiosInstance = useAxiosInstance();
	const { isCurrentlyImpersonating } = useAdmin();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce({ value: search.trim(), delayMs: 250 });

	const orgsQuery = useQuery({
		queryKey: ["admin-impersonate-orgs", debouncedSearch],
		queryFn: async () => {
			const params = new URLSearchParams({ search: debouncedSearch });
			const { data } = await axiosInstance.get<{ rows: ImpersonatableOrg[] }>(
				`/admin/orgs?${params}`,
			);
			return data.rows;
		},
		enabled: debouncedSearch.length > 0,
	});

	const impersonate = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			const { data } = await axiosInstance.get<{ userId?: string }>(
				`/admin/org-member?org_id=${orgId}`,
			);
			if (!data.userId) throw new Error("No member found for this org");
			await impersonateUser({
				userId: data.userId,
				organizationId: orgId,
				isCurrentlyImpersonating,
			});
		},
		onError: (error) => {
			console.error("Failed to impersonate organization:", error);
			toast.error(getBackendErr(error, "Failed to impersonate organization"));
		},
	});

	return {
		orgs: orgsQuery.data ?? [],
		isSearching: orgsQuery.isFetching,
		setSearch,
		impersonate: (orgId: string) => impersonate.mutate({ orgId }),
		isImpersonating: impersonate.isPending,
	};
};
