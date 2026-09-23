import {
	type ApplyBillingPlanCommand,
	type ApplyBillingPlanRequest,
	applyBillingPlanToSubjects,
	type BillingPlanEntityPart,
	catalogRowsToCatalog,
	customerRowsToSubjectState,
	type MeteringIdentity,
	type SubjectState,
	type SubjectStateMutation,
} from "@autumn/balance-engine";
import type {
	AutumnBillingPlan,
	Customer,
	Entity,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { applyBillingPlanOnWorker } from "@/internal/balanceWorker/billingPlan/applyBillingPlanOnWorker.js";
import { newCustomer } from "../billingPlanFixtures.js";

const ctx = {
	...contexts.create({}),
	id: "req_worker_memory",
	timestamp: 1_700_000_000_000,
};

export const customerIdentity: MeteringIdentity = {
	orgId: ctx.org.id,
	env: ctx.env,
	customerId: "cus_test",
	entityId: null,
};

type OwnedRows = {
	customerProducts?: FullCusProduct[];
	/** Grants outside any product. */
	looseGrants?: FullCustomerEntitlement[];
};

/** An owner's rows as Postgres returns them: grants with their rollovers split into their own table. */
const ownedRowsOf = ({
	customerProducts = [],
	looseGrants = [],
}: OwnedRows) => {
	const customerEntitlements = [
		...customerProducts.flatMap(
			({ customer_entitlements }) => customer_entitlements,
		),
		...looseGrants,
	];
	return {
		customerProducts,
		customerPrices: customerProducts.flatMap(
			({ customer_prices }) => customer_prices,
		),
		customerEntitlements,
		rollovers: customerEntitlements.flatMap(({ rollovers }) => rollovers),
		usageWindows: [],
	};
};

/** The customer's part as hydration builds it. */
export const customerMemory = ({
	customer = newCustomer,
	...rows
}: OwnedRows & { customer?: Customer } = {}): SubjectState =>
	customerRowsToSubjectState({
		identity: customerIdentity,
		customer,
		...ownedRowsOf(rows),
		entity: null,
	});

/** An entity's part as hydration builds it: its own rows, under its own identity. */
export const entityMemory = ({
	entity,
	customer = newCustomer,
	...rows
}: OwnedRows & {
	entity: Entity;
	customer?: Customer;
}): BillingPlanEntityPart => {
	if (!entity.id) throw new Error("an entity part needs the entity's id");
	const state = customerRowsToSubjectState({
		identity: { ...customerIdentity, entityId: entity.id },
		customer,
		...ownedRowsOf(rows),
		entity,
	});
	if (!state.entity) throw new Error("hydration dropped the entity row");
	return { state, entity: state.entity };
};

/** The command exactly as the server sends it, or null when the plan writes nothing the worker holds. */
const commandSentFor = async ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<ApplyBillingPlanCommand | null> => {
	const sent: ApplyBillingPlanRequest[] = [];
	await applyBillingPlanOnWorker({
		ctx,
		customerId: customerIdentity.customerId,
		autumnBillingPlan,
		client: {
			applyBillingPlan: async ({ request }) => {
				sent.push(request);
				return {
					result: { status: "applied" },
					state: customerMemory(),
					catalog: catalogRowsToCatalog({ rows: request.catalogRows }),
				};
			},
		},
	});
	return sent[0]?.command ?? null;
};

export type WorkerMemory = {
	customer: SubjectState | null;
	entities?: BillingPlanEntityPart[];
};

export type AppliedWorkerMemory = {
	customer: SubjectState;
	/** Every entity the worker holds after the plan, by external id. */
	entities: Map<string, SubjectState>;
	/** Null when the plan wrote nothing the worker holds, so nothing was sent. */
	mutation: SubjectStateMutation | null;
};

const entityIdOf = (state: SubjectState): string => {
	if (!state.identity.entityId) throw new Error("not an entity part");
	return state.identity.entityId;
};

/** Sends the plan the way the server does and applies it the way the worker does, reading only the entities the command names. */
export const applyPlanToWorkerMemory = async ({
	autumnBillingPlan,
	memory,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	memory: WorkerMemory;
}): Promise<AppliedWorkerMemory> => {
	const heldEntities = memory.entities ?? [];
	const held = new Map(
		heldEntities.map((part) => [entityIdOf(part.state), part.state]),
	);
	const command = await commandSentFor({ autumnBillingPlan });
	if (!command) {
		if (!memory.customer) throw new Error("nothing sent and no customer held");
		return { customer: memory.customer, entities: held, mutation: null };
	}

	const namedParts = heldEntities.filter(({ entity }) =>
		command.entityIds.some((entityId) => entityId === entity.id),
	);
	const { projectedStates, mutation } = applyBillingPlanToSubjects({
		command,
		customer: memory.customer,
		entityParts: namedParts,
	});
	const [customer, ...entityStates] = projectedStates;
	if (!customer) throw new Error("the customer's part is always projected");
	for (const state of entityStates) held.set(entityIdOf(state), state);
	return { customer, entities: held, mutation };
};

export const entityPartIn = ({
	applied,
	entityId,
}: {
	applied: AppliedWorkerMemory;
	entityId: string;
}): SubjectState => {
	const state = applied.entities.get(entityId);
	if (!state) throw new Error(`no part for entity ${entityId}`);
	return state;
};

export const idsOf = (rows: readonly { id: string }[]): string[] =>
	rows.map(({ id }) => id);

export const rowById = <Row extends { id: string }>({
	rows,
	id,
}: {
	rows: readonly Row[];
	id: string;
}): Row => {
	const row = rows.find((candidate) => candidate.id === id);
	if (!row) throw new Error(`no row ${id}`);
	return row;
};
