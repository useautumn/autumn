import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { reconcileActiveSandbox } from "@/hooks/sandbox/reconcileActiveSandbox";
import {
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type SandboxSummary = {
	id: string;
	name: string;
	slug: string;
	created_at: string;
};

// Sandboxes are main-org-scoped, so the key is env-independent (no refetch on env switch).
const sandboxesKey = (orgId: string | undefined) => ["sandboxes", orgId];

export const useSandboxesQuery = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}) => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { org } = useOrg();
	const activeSandbox = useActiveSandbox();

	const { data, isLoading, isFetching, isSuccess, error, refetch } = useQuery({
		queryKey: sandboxesKey(org?.id),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/v1/sandboxes.list");
			return data;
		},
		enabled,
	});

	const sandboxes = useMemo(
		() => (data?.list ?? []) as SandboxSummary[],
		[data],
	);

	// Drop a persisted selection only after the list has actually loaded;
	// reconciling against a not-yet-loaded (disabled/in-flight) empty list would
	// wipe a cold-reload restore from localStorage before the list ever arrives.
	useEffect(() => {
		const next = reconcileActiveSandbox({
			activeSandbox,
			sandboxes,
			listLoaded: isSuccess,
		});
		if (next !== activeSandbox) {
			setActiveSandbox(next);
		}
	}, [activeSandbox, sandboxes, isSuccess]);

	return {
		sandboxes,
		isLoading,
		isFetching,
		error,
		refetch,
	};
};

export type CreateSandboxResponse = {
	id: string;
	name: string;
	slug: string;
	secret_key: string;
};

export const useCreateSandbox = () => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { org } = useOrg();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (name: string) => {
			const { data } = await axiosInstance.post<CreateSandboxResponse>(
				"/v1/sandboxes.create",
				{ name },
			);
			return data;
		},
		// Optimistically insert so the switcher shows it at once and the stale guard keeps it active.
		onSuccess: (created) => {
			const key = sandboxesKey(org?.id);
			queryClient.setQueryData(
				key,
				(old: { list?: SandboxSummary[] } | undefined) => ({
					...old,
					list: [
						{
							id: created.id,
							name: created.name,
							slug: created.slug,
							created_at: new Date().toISOString(),
						},
						...(old?.list ?? []),
					],
				}),
			);
			queryClient.invalidateQueries({ queryKey: key });
		},
	});
};
