import type { AppEnv, FrontendOrg } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const ORG_STORAGE_KEY = "autumn_org";

export const useOrg = (params?: { env?: AppEnv }) => {
	const axiosInstance = useAxiosInstance({ env: params?.env });
	const { data: orgList } = useListOrganizations();

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/organization");
			// Store in local storage
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

	const {
		data: org,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: params?.env ? ["org", params.env] : ["org"],
		queryFn: fetcher,
		initialData: getInitialData(),
		retry: false,
	});

	useEffect(() => {
		const handleNoActiveOrg = async () => {
			// 1. If there's existing org, set as active
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
