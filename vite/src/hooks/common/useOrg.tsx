import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const ORG_STORAGE_KEY = "autumn_org";

let lastSwitchedOrgId: string | null = null;
export const setLastSwitchedOrgId = (id: string) => {
	lastSwitchedOrgId = id;
};
export const getLastSwitchedOrgId = () => lastSwitchedOrgId;

/** Clears all org-related localStorage cache entries. Call before reload on session changes (impersonation start/stop). */
export const clearOrgCache = () => {
	for (const key of Object.keys(localStorage)) {
		if (key.startsWith(ORG_STORAGE_KEY)) {
			localStorage.removeItem(key);
		}
	}
};

export const useOrg = (params?: { env?: AppEnv }) => {
	const axiosInstance = useAxiosInstance({ env: params?.env });
	const { data: orgList } = useListOrganizations();

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/organization");
			if (data) {
				const storageKey = params?.env
					? `${ORG_STORAGE_KEY}_${params.env}`
					: ORG_STORAGE_KEY;
				localStorage.setItem(storageKey, JSON.stringify(data));
			}
			return data;
		} catch {
			return null;
		}
	};

	const getInitialData = () => {
		try {
			const storageKey = params?.env
				? `${ORG_STORAGE_KEY}_${params.env}`
				: ORG_STORAGE_KEY;
			const stored = localStorage.getItem(storageKey);
			return stored ? JSON.parse(stored) : undefined;
		} catch {
			return undefined;
		}
	};

	const initialDataValue = getInitialData();

	const {
		data: org,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: params?.env ? ["org", params.env] : ["org"],
		queryFn: fetcher,
		initialData: initialDataValue,
		placeholderData: keepPreviousData,
	});

	useEffect(() => {
		const handleNoActiveOrg = async () => {
			if (orgList && orgList.length > 0) {
				await authClient.organization.setActive({
					organizationId: orgList[0].id,
				});
				window.location.reload();
			} else {
				console.log("No org to set active, signing out");
				await authClient.signOut();
			}
		};

		// 1. If no org...
		if (!org && !isLoading) {
			handleNoActiveOrg();
		}
	}, [org, orgList, isLoading]);

	return { org: org as FrontendOrg, isLoading, error, mutate: refetch };
};
