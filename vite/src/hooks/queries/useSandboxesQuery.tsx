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
	color: string;
	icon: string;
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
		isSuccess,
		error,
		refetch,
	};
};

export type CreateSandboxResponse = {
	id: string;
	name: string;
	slug: string;
	color: string;
	icon: string;
	secret_key: string;
};

export const useCreateSandbox = () => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { org } = useOrg();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			name,
			color,
			icon,
		}: {
			name: string;
			color: string;
			icon: string;
		}) => {
			const { data } = await axiosInstance.post<CreateSandboxResponse>(
				"/v1/sandboxes.create",
				{ name, color, icon },
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
							color: created.color,
							icon: created.icon,
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

export const useUpdateSandbox = () => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { org } = useOrg();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			name,
			color,
			icon,
		}: {
			id: string;
			name: string;
			color: string;
			icon: string;
		}) => {
			await axiosInstance.post("/v1/sandboxes.update", {
				id,
				name,
				color,
				icon,
			});
			return { id, name, color, icon };
		},
		onSuccess: ({ id, name, color, icon }) => {
			const key = sandboxesKey(org?.id);
			queryClient.setQueryData(
				key,
				(old: { list?: SandboxSummary[] } | undefined) => ({
					...old,
					list: (old?.list ?? []).map((s) =>
						s.id === id ? { ...s, name, color, icon } : s,
					),
				}),
			);
			queryClient.invalidateQueries({ queryKey: key });
		},
	});
};

export const useDeleteSandbox = () => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const { org } = useOrg();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			await axiosInstance.post("/v1/sandboxes.delete", { id });
			return id;
		},
		onSuccess: (deletedId) => {
			const key = sandboxesKey(org?.id);
			queryClient.setQueryData(
				key,
				(old: { list?: SandboxSummary[] } | undefined) => ({
					...old,
					list: (old?.list ?? []).filter((s) => s.id !== deletedId),
				}),
			);
			queryClient.invalidateQueries({ queryKey: key });
		},
	});
};

export const useCopySandbox = () => {
	const axiosInstance = useAxiosInstance({ skipSandbox: true });
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			fromSandboxId,
			toSandboxId,
			productIds,
			featureIds,
		}: {
			fromSandboxId: string;
			toSandboxId: string;
			productIds?: string[];
			featureIds?: string[];
		}) => {
			await axiosInstance.post("/v1/sandboxes.copy", {
				fromSandboxId,
				toSandboxId,
				productIds,
				featureIds,
			});
		},
		// Copy overwrites the target's whole catalog, so refresh any open plan/feature views.
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["products"] });
			queryClient.invalidateQueries({ queryKey: ["product_counts"] });
			queryClient.invalidateQueries({ queryKey: ["features"] });
		},
	});
};
