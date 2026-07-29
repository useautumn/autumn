import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/hooks/common/useOrg";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import type {
	CreateSsoConnectionParams,
	SsoConnectionResponse,
} from "@/lib/sso/ssoTypes";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/**
 * Mutations for the single org SSO connection. Every mutation that returns the
 * connection writes it straight into the query cache so the staged UI advances
 * without a second round trip.
 */
export const useSsoActions = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	const { org } = useOrg();
	const queryKey = buildKey(["org", org?.id, "sso"]);

	const setConnection = (data: SsoConnectionResponse) => {
		queryClient.setQueryData<SsoConnectionResponse>(queryKey, data);
	};

	const create = useMutation({
		mutationFn: async (params: CreateSsoConnectionParams) => {
			const { data } = await OrgService.createSso(axiosInstance, params);
			return data;
		},
		onSuccess: setConnection,
	});

	const verifyDomain = useMutation({
		mutationFn: async () => {
			const { data } = await OrgService.verifySsoDomain(axiosInstance);
			return data;
		},
		onSuccess: setConnection,
	});

	const remove = useMutation({
		mutationFn: async () => {
			await OrgService.deleteSso(axiosInstance);
		},
		onSuccess: () => {
			// DELETE returns only `{ success: true }`, so keep the cached `setup`
			// (the callback URL survives the connection) and drop the connection.
			queryClient.setQueryData<SsoConnectionResponse>(queryKey, (old) =>
				old ? { ...old, connection: null } : old,
			);
			queryClient.invalidateQueries({ queryKey });
		},
	});

	const testSignIn = useMutation({
		mutationFn: async () => {
			const { data } = await OrgService.testSso(axiosInstance);
			return data;
		},
	});

	return { create, verifyDomain, remove, testSignIn };
};
