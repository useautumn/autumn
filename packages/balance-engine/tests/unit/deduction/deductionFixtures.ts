import type {
	CommandOrg,
	WorkerCustomer,
	WorkerCustomerEntitlement,
	WorkerCustomerProduct,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import {
	createSubjectState,
	incrementRow,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import { toDeductionSelection } from "../../../src/deduction/toDeductionSelection.js";
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
	includesCreditSystems = true,
	enforcesSpendLimit = true,
	customerEntitlementFilters,
	countsUsageWindows = true,
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
	includesCreditSystems?: boolean;
	enforcesSpendLimit?: boolean;
	customerEntitlementFilters?: DeductionRequest["selection"]["customerEntitlementFilters"];
	countsUsageWindows?: boolean;
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
			includesCreditSystems,
			enforcesSpendLimit,
			customerEntitlementFilters,
			countsUsageWindows,
			properties,
			value,
		}),
	});

/** A request from flat inputs: the selection's org settings and the draw's terms both derived here, as the commands do. */
export const createDeductionRequest = ({
	featureId = "messages",
	internalFeatureId = `feat_${featureId}`,
	value,
	overageBehavior = "cap",
	includesCreditSystems = true,
	enforcesSpendLimit = true,
	customerEntitlementFilters,
	countsUsageWindows = true,
	properties = null,
	enforceOverdueBlock = false,
	now = occurredAt,
	org,
}: {
	featureId?: string;
	internalFeatureId?: string;
	value: number;
	overageBehavior?: DeductionRequest["terms"]["overageBehavior"];
	includesCreditSystems?: boolean;
	enforcesSpendLimit?: boolean;
	customerEntitlementFilters?: DeductionRequest["selection"]["customerEntitlementFilters"];
	countsUsageWindows?: boolean;
	properties?: DeductionRequest["selection"]["properties"];
	enforceOverdueBlock?: boolean;
	now?: number;
	org: CommandOrg;
}): DeductionRequest => ({
	selection: toDeductionSelection({
		featureId,
		internalFeatureId,
		now,
		properties,
		includesCreditSystems,
		countsUsageWindows,
		customerEntitlementFilters,
		org,
		enforceOverdueBlock,
	}),
	terms: { overageBehavior, enforcesSpendLimit },
	value,
});

const rowBeforeOf = ({
	outcome,
	table,
	id,
}: {
	outcome: DeductionOutcome;
	table: "customerEntitlements" | "rollovers" | "usageWindows";
	id: string;
}): object => {
	const rows: { id: string }[] =
		table === "customerEntitlements"
			? outcome.context.customerEntitlements
			: table === "rollovers"
				? outcome.context.rollovers
				: outcome.context.usageWindows;
	const row = rows.find((candidate) => candidate.id === id);
	if (!row) throw new Error(`No ${table} row ${id} in the deduction context`);
	return row;
};

/** Each moved row as `[id, columns as the change leaves them]`: an increment read through the row it moved, an update's `after`; inserts and deletes pass through. */
export const balancesAfter = (outcome: DeductionOutcome) =>
	outcome.changes.map((change) => {
		if (change.op === "update") return [change.id, change.after];
		if (change.op !== "increment" || change.table === "pooledBalances")
			return change;
		const after = incrementRow({
			row: rowBeforeOf({ outcome, table: change.table, id: change.id }),
			change,
		});
		const touched = [
			...Object.keys(change.add),
			...Object.keys(change.addEntries ?? {}),
		];
		return [
			change.id,
			Object.fromEntries(
				touched.map((column) => [column, Reflect.get(after, column)]),
			),
		];
	});

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
