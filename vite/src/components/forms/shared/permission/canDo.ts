import type { AxiosInstance } from "axios";

// Mirrors S3's renamed ACTIONS ids (PRD decision 6); swap for ApprovalAction from @autumn/shared once S3 freezes.
export const APPROVAL_ACTION_IDS = [
	"billing.attach",
	"billing.update",
	"billing.set_plans",
	"billing.create_schedule",
	"billing.cancel",
	"billing.uncancel",
	"invoices.create",
	"invoices.finalize",
	"invoices.pay",
	"invoices.void",
	"invoices.update",
	"invoices.reissue",
	"invoices.issue_credit_note",
	"balances.create",
	"balances.update",
	"rewards.create",
	"rewards.redeem",
	"customers.get_or_create",
	"customers.update",
	"customers.delete",
	"plans.create",
	"plans.update",
	"plans.delete",
	"features.create",
	"features.update",
	"features.delete",
	"api_keys.create",
	"migrations.create",
	"migrations.run",
	"billing.multi_attach",
	"billing.multi_update",
	"migrations.lazy_run",
] as const;

export type ApprovalActionId = (typeof APPROVAL_ACTION_IDS)[number];

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
	action: ApprovalActionId;
}) => (await axios.post<CanDoResponse>("/approvals.can", { action })).data;

/** Gates on `can` alone; `reason` is informational. An unanswered check allows. */
export const canDoAllows = ({
	response,
}: {
	response: CanDoResponse | undefined;
}) => !response || response.can;
