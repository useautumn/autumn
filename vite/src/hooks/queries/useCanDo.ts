import { useQuery } from "@tanstack/react-query";
import {
	type ApprovalActionId,
	canDoAllows,
	fetchCanDo,
} from "@/components/forms/shared/permission/canDo";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const canDoQueryKey = (action: ApprovalActionId) =>
	["approvals-can", action] as const;

/** Whether the member can start `action`; true until `approvals.can` answers or if it fails. */
export const useCanDo = (action: ApprovalActionId) => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { data, isError } = useQuery({
		queryKey: buildKey(canDoQueryKey(action)),
		queryFn: () => fetchCanDo({ axios, action }),
		staleTime: 60_000,
		retry: false,
	});

	// A failed refresh keeps stale data; failing open means ignoring it.
	return isError || canDoAllows({ response: data });
};
