import { expect } from "bun:test";
import type {
	CommandOrg,
	WorkerCustomer,
	WorkerCustomerEntitlement,
	WorkerCustomerProduct,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import {
	applyChanges,
	type Catalog,
	createSubjectState,
	incrementRow,
	type RowChange,
	type SubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { advanceDeductionContext } from "../../../src/deduction/advanceDeductionContext.js";
import { deduct, deductWithContext } from "../../../src/deduction/deduct.js";
import { setupDeductionContext } from "../../../src/deduction/setup/setupDeductionContext.js";
import { toDeductionSelection } from "../../../src/deduction/toDeductionSelection.js";
import type { DeductionContext } from "../../../src/deduction/types/deductionContext.js";
import type { DeductionRequest } from "../../../src/deduction/types/deductionRequest.js";
import {
	createCatalogFor,
	createCustomerProduct,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";

export type DeductionOutcome = ReturnType<typeof deduct>;

/** Every scenario also proves a context set up once and drawn from gives the same outcome as `deduct`. */
export const deductAndCompare = (params: Parameters<typeof deduct>[0]) => {
	const outcome = deduct(params);
	const context = setupDeductionContext({
		fullSubject: params.fullSubject,
		selection: params.request.selection,
	});
	expect(deductWithContext({ context, request: params.request })).toEqual(
		outcome,
	);
	return outcome;
};

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
	deductAndAdvance({
		state: createSubjectState({
			identity,
			customer,
			customerProducts,
			customerEntitlements,
			rollovers: rollovers.map((rollover) => ({ entities: {}, ...rollover })),
			usageWindows,
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

const COUNTERS: Record<string, { add: string[]; entries: string[] }> = {
	customerEntitlements: {
		add: ["balance"],
		entries: ["entities", "usage_attribution"],
	},
	rollovers: { add: ["balance", "usage"], entries: ["entities"] },
};

/** What the advance promises to carry: increments of balance counters on entitlement and rollover rows. */
const isBalanceOnly = ({ changes }: { changes: RowChange[] }): boolean =>
	changes.every((change) => {
		const counters = COUNTERS[change.table];
		if (!counters || change.op !== "increment" || "guard" in change)
			return false;
		const entries = Object.keys(change.addEntries ?? {});
		const entityCounters = Object.values(
			(change.addEntries as { entities?: Record<string, object> })?.entities ??
				{},
		).flatMap((entry) => Object.keys(entry));
		return (
			Object.keys(change.add).every((key) => counters.add.includes(key)) &&
			entries.every((key) => counters.entries.includes(key)) &&
			entityCounters.every((key) => counters.add.includes(key))
		);
	});

/** A context as a draw reads it: each row's plan, but not the plan's own copy of its rows. */
const drawnRowsOf = ({ context }: { context: DeductionContext }) => ({
	...context,
	customerEntitlements: context.customerEntitlements.map((row) => ({
		...row,
		customer_product: row.customer_product && {
			...row.customer_product,
			customer_entitlements: [],
		},
	})),
});

/**
 * Every scenario also proves the carried context: advanced by the applied changes, it is the context a
 * fresh setup finds on the state those changes leave, and the next draw on it decides the same.
 */
export const deductAndAdvance = ({
	state,
	request,
	catalog = createCatalogFor({ state }),
}: {
	state: SubjectState;
	request: DeductionRequest;
	catalog?: Catalog;
}) => {
	const outcome = deductAndCompare({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		request,
	});
	const advanced = advanceDeductionContext({
		context: outcome.context,
		changes: outcome.changes,
	});
	const carries =
		isBalanceOnly({ changes: outcome.changes }) &&
		outcome.context.allocationGates.size === 0;
	expect(advanced !== null).toBe(carries);
	if (!advanced) return outcome;
	const rebuilt = setupDeductionContext({
		fullSubject: subjectStateToFullSubject({
			state: applyChanges({ state, changes: outcome.changes }),
			catalog,
		}),
		selection: request.selection,
	});
	expect(drawnRowsOf({ context: advanced })).toEqual(
		drawnRowsOf({ context: rebuilt }),
	);
	const { context: _carried, ...nextOnAdvanced } = deductWithContext({
		context: advanced,
		request,
	});
	const { context: _fresh, ...nextOnRebuilt } = deductWithContext({
		context: rebuilt,
		request,
	});
	expect(nextOnAdvanced).toEqual(nextOnRebuilt);
	return outcome;
};

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
	countsAllocations = true,
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
	countsAllocations?: boolean;
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
		countsAllocations,
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
