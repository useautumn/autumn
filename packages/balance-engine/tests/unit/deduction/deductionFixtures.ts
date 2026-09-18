import type {
	CommandOrg,
	WorkerCustomer,
	WorkerCustomerEntitlement,
	WorkerCustomerProduct,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import { createSubjectState } from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import {
	createCustomerProduct,
	createSubjectFor,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";

export type DeductionOutcome = ReturnType<typeof deduct>;

export const deductFrom = ({
	customer,
	customerProducts = [createCustomerProduct()],
	customerEntitlements,
	rollovers = [],
	usageWindows = [],
	value,
	overageBehavior = "cap",
	orgConfig = org.config,
	properties = null,
}: {
	customer?: WorkerCustomer;
	customerProducts?: WorkerCustomerProduct[];
	customerEntitlements: WorkerCustomerEntitlement[];
	usageWindows?: WorkerUsageWindow[];
	properties?: Record<string, string> | null;
	rollovers?: {
		id: string;
		cus_ent_id: string;
		balance: number;
		usage: number;
		expires_at: number | null;
	}[];
	value: number;
	overageBehavior?: "cap" | "reject" | "overflow";
	orgConfig?: CommandOrg["config"];
}) =>
	deduct({
		fullSubject: createSubjectFor({
			state: createSubjectState({
				identity,
				customer,
				customerProducts,
				customerEntitlements,
				rollovers: rollovers.map((rollover) => ({ entities: {}, ...rollover })),
				usageWindows,
			}),
		}),
		request: createDeductionRequest({
			org: { config: orgConfig },
			overageBehavior,
			properties,
			value,
		}),
	});

export const createDeductionRequest = ({
	featureId = "messages",
	internalFeatureId = `feat_${featureId}`,
	value,
	overageBehavior = "cap",
	properties = null,
	enforceOverdueBlock = false,
	now = occurredAt,
	org,
}: Partial<DeductionRequest> &
	Pick<DeductionRequest, "value" | "org">): DeductionRequest => ({
	featureId,
	internalFeatureId,
	value,
	overageBehavior,
	properties,
	enforceOverdueBlock,
	now,
	org,
});

/** Each updated row as `[id, after]`; inserts and deletes pass through. */
export const balancesAfter = (outcome: DeductionOutcome) =>
	outcome.changes.map((change) =>
		change.op === "update" ? [change.id, change.after] : change,
	);

/** The customer row with the given billing controls on it. */
export const customerWith = (
	controls: Partial<
		Pick<WorkerCustomer, "spend_limits" | "overage_allowed" | "usage_limits">
	>,
): WorkerCustomer => ({
	internal_id: "cus_1",
	id: "cus_1",
	config: null,
	spend_limits: null,
	overage_allowed: null,
	...controls,
});
