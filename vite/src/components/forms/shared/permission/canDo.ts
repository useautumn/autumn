import type { ApprovalAction } from "@autumn/shared";
import type { AxiosInstance } from "axios";

// Mirrors E3's `approvals.can` response; swap for the @autumn/shared type once E3 freezes.
export type CanDoResponse = {
	can: boolean;
	reason: "scope" | "blocked" | "none";
};

export const fetchCanDo = async ({
	axios,
	action,
}: {
	axios: AxiosInstance;
	action: ApprovalAction;
}) => (await axios.post<CanDoResponse>("/approvals.can", { action })).data;

/** Gates on `can` alone; `reason` is informational. An unanswered check allows. */
export const canDoAllows = ({
	response,
}: {
	response: CanDoResponse | undefined;
}) => !response || response.can;
