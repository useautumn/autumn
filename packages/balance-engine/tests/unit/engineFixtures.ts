import {
	type CustomerStateMutation,
	createCustomerState,
	type LeanCustomerEntitlement,
	parseCheckCommand,
	parseInitializeCommand,
	parseTrackCommand,
	type TrackDecision,
	type TrackResult,
} from "../../src/balanceEngine.js";

export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

export const occurredAt = 1_700_000_000_000;
export const deduplicationExpiresAt = 1_700_086_400_000;

export const createCustomerEntitlement = ({
	id = "messages_monthly",
	featureId = "messages",
	balance = 10,
	usage = 0,
}: {
	id?: string;
	featureId?: string;
	balance?: number;
	usage?: number;
} = {}): LeanCustomerEntitlement => ({
	id,
	externalId: null,
	featureId,
	balance,
	usage,
	granted: balance + usage,
	planId: null,
	reset: null,
	expiresAt: null,
});

export const createState = ({
	balance = 10,
	customerEntitlements,
}: {
	balance?: number;
	customerEntitlements?: LeanCustomerEntitlement[];
} = {}) =>
	createCustomerState({
		identity,
		customerEntitlements: customerEntitlements ?? [
			createCustomerEntitlement({ balance }),
		],
	});

export const createTrackCommand = ({
	commandId = "cmd_1",
	requestId = "req_1",
	featureId = "messages",
	value = 5,
	overageBehavior = "reject",
	entityId = null,
	properties = null,
}: {
	commandId?: string;
	requestId?: string;
	featureId?: string;
	value?: number;
	overageBehavior?: "cap" | "reject" | "overflow";
	entityId?: string | null;
	properties?: Record<string, unknown> | null;
} = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId,
			identity,
			entityId,
			featureId,
			value,
			overageBehavior,
			properties,
			occurredAt,
		},
	});

export const createCheckCommand = ({
	requiredBalance = 5,
	featureId = "messages",
	entityId = null,
	properties = null,
}: {
	requiredBalance?: number;
	featureId?: string;
	entityId?: string | null;
	properties?: Record<string, unknown> | null;
} = {}) =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: "req_check_1",
			identity,
			entityId,
			featureId,
			requiredBalance,
			properties,
			occurredAt,
		},
	});

export const createInitializeCommand = ({
	commandId = "init_1",
	requestId = "req_init_1",
	state = createState(),
}: {
	commandId?: string;
	requestId?: string;
	state?: ReturnType<typeof createState>;
} = {}) =>
	parseInitializeCommand({
		input: {
			schemaVersion: 1,
			type: "initialize",
			requestId,
			commandId,
			identity: state.identity,
			state,
			occurredAt,
		},
	});

export const requireNewMutation = (
	decision: TrackDecision,
): CustomerStateMutation => {
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const trackResultOf = ({
	mutation,
}: {
	mutation: CustomerStateMutation;
}): TrackResult => {
	if (mutation.result.type !== "track") {
		throw new Error(
			`Expected a track result, received ${mutation.result.type}`,
		);
	}
	return mutation.result;
};
