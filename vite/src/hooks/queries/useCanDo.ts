import type { ApprovalAction } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import {
	canDoAllows,
	fetchCanDo,
} from "@/components/forms/shared/permission/permissionDenialUtils";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const canDoQueryKey = (action: ApprovalAction) =>
	["approvals-can", action] as const;

/** Whether the member can start `action`; true until `/approvals/can` answers or if it fails. */
export const useCanDo = (action: ApprovalAction) => {
	const axios = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { data } = useQuery({
		queryKey: buildKey(canDoQueryKey(action)),
		queryFn: () => fetchCanDo({ axios, action }),
		staleTime: 60_000,
		retry: false,
	});

	return canDoAllows({ response: data });
};
