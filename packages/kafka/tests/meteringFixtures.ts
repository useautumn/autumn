import {
	type CustomerState,
	type CustomerStateMutation,
	computeInitialize,
	computeTrack,
	createCustomerState,
	type MeteringIdentity,
	parseInitializeCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";

export const testIdentity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
};

const occurredAt = 1_700_000_000_000;
const deduplicationExpiresAt = 1_700_086_400_000;

export const createState = ({
	identity = testIdentity,
	balance = 10,
}: {
	identity?: MeteringIdentity;
	balance?: number;
} = {}): CustomerState =>
	createCustomerState({
		identity,
		customerEntitlements: [
			{
				id: "messages_monthly",
				externalId: null,
				featureId: "messages",
				balance,
				usage: 0,
				granted: balance,
				planId: null,
				reset: null,
				expiresAt: null,
			},
		],
	});

export const createTrackMutation = ({
	state = createState(),
	commandId = "cmd_1",
	value = 5,
}: {
	state?: CustomerState;
	commandId?: string;
	value?: number;
} = {}): CustomerStateMutation => {
	const decision = computeTrack({
		state,
		deduplicationExpiresAt,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId: `req_${commandId}`,
				identity: state.identity,
				entityId: null,
				featureId: "messages",
				value,
				overageBehavior: "reject",
				properties: null,
				occurredAt,
			},
		}),
	});
	if (decision.kind !== "new") {
		throw new Error(`Expected a new mutation, received ${decision.kind}`);
	}
	return decision.mutation;
};

export const createInitializeMutation = ({
	state = createState(),
	commandId = "init_1",
}: {
	state?: CustomerState;
	commandId?: string;
} = {}): CustomerStateMutation =>
	computeInitialize({
		command: parseInitializeCommand({
			input: {
				schemaVersion: 1,
				type: "initialize",
				requestId: `req_${commandId}`,
				commandId,
				identity: state.identity,
				state,
				occurredAt,
			},
		}),
		deduplicationExpiresAt,
	});
