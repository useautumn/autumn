import type { FrontendOrg } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const useOrg = () => {
	const axiosInstance = useAxiosInstance();
	const { data: orgList } = useListOrganizations();

	const fetcher = async () => {
		try {
			const { data } = await axiosInstance.get("/organization");
			return data;
		} catch (error) {
			return null;
		}
	};

	const {
		data: org,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["org"],
		queryFn: fetcher,
	});

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

	useEffect(() => {
		// 1. If no org...
		if (!org && !isLoading) {
			handleNoActiveOrg();
		}
	}, [org, orgList]);

	return { org: org as FrontendOrg, isLoading, error, mutate: refetch };
};
