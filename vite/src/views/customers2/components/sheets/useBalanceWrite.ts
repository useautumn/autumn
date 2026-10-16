import { useMutation } from "@tanstack/react-query";
import type { PermissionSections } from "@/components/forms/shared/permission/permissionDenialUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Lets the balance sheets read their latest failed write; gcTime 0 drops it once the sheet unmounts. */
export const BALANCE_WRITE_KEY = ["balance-write"] as const;

/** Balance violations by field root; the rest show in the summary. */
export const BALANCE_DENIAL_SECTIONS: PermissionSections = {
	feature_id: "feature",
	included_grant: "grant",
	unlimited: "grant",
	add_to_balance: "grant",
	remaining: "grant",
	usage: "grant",
	reset: "reset",
	expires_at: "expires",
};

/** `onSuccess` is awaited before the write stops pending, so a refetch there keeps submit busy. */
export const useBalanceWrite = ({
	onSuccess,
}: {
	onSuccess?: () => Promise<unknown>;
} = {}) => {
	const axios = useAxiosInstance();
	return useMutation({
		mutationKey: BALANCE_WRITE_KEY,
		gcTime: 0,
		mutationFn: ({ path, body }: { path: string; body: object }) =>
			axios.post(path, body),
		onSuccess,
	});
};
