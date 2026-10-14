import { createSubjectState } from "@autumn/balance-engine";
import {
	ApiVersion,
	ApiVersionClass,
	type CheckResponseV3,
	LATEST_VERSION,
	OrgConfigSchema,
	type SharedContext,
} from "@autumn/shared";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createState,
	entity,
	identity,
	occurredAt,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../src/lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../../src/processor/types/check.js";
import type { SlotProcessor } from "../../../src/processor/types/slotProcessor.js";
import type { Replication } from "../../../src/replication/types/replication.js";
import { createHeldSubjects } from "../../../src/state/heldSubjects/createHeldSubjects.js";
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";
import type {
	FolderSubjectPulls,
	SubjectPulls,
} from "../../../src/subjectPulls/types/subjectPulls.js";
import type { SlotOwners } from "../../../src/threads/owners/types/slotOwners.js";

export const atomOrg: SharedContext["org"] = {
	config: OrgConfigSchema.parse({}),
	default_currency: "usd",
};

export const checkResponseOf = async ({
	processor,
	request,
}: {
	processor: SlotProcessor;
	request: CheckRequest;
}): Promise<CheckResponseV3> =>
	JSON.parse((await processor.check({ request })).json);

export const subjectBody = ({ balance }: { balance: number }) => {
	const state = createState({ balance });
	return {
		state,
		catalog: createCatalogFor({ state }),
		org: atomOrg,
		log_offset: "41",
		read_at: 1700,
	};
};

export const subjectPushOf = ({
	subject,
}: {
	subject: StoredSubject;
}): { customerId: string; body: string } => ({
	customerId: subject.state.identity.customerId,
	body: JSON.stringify({
		state: subject.state,
		catalog: subject.catalog,
		org: subject.org,
		log_offset: subject.logOffset.toString(),
		read_at: subject.readAt,
		...(subject.customerVersion > 0n && {
			customer_version: subject.customerVersion.toString(),
		}),
	}),
});

export const deletedPushOf = ({
	entityId = null,
	logOffset,
	readAt,
}: {
	entityId?: string | null;
	logOffset: bigint;
	readAt: number;
}): { customerId: string; body: string } => ({
	customerId: identity.customerId,
	body: JSON.stringify({
		identity: { ...identity, entityId },
		log_offset: logOffset.toString(),
		read_at: readAt,
	}),
});

export const storedSubjectWith = ({
	balance,
	readAt = 1000,
}: {
	balance: number;
	readAt?: number;
}): StoredSubject => {
	const state = createState({ balance });
	return {
		state,
		catalog: createCatalogFor({ state }),
		org: atomOrg,
		logOffset: 1n,
		readAt,
		customerVersion: 0n,
	};
};

export const storedEntitySubjectWith = ({
	customerBalance,
	entityBalance,
	readAt = 1000,
}: {
	customerBalance: number;
	entityBalance: number;
	readAt?: number;
}): StoredSubject => {
	const state = createSubjectState({
		identity: { ...identity, entityId: entity.id },
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({ balance: customerBalance }),
			{
				...createCustomerEntitlement({
					id: "messages_ent_42",
					balance: entityBalance,
				}),
				customer_product_id: null,
				internal_entity_id: entity.internal_id,
			},
		],
		entity,
	});
	return {
		state,
		catalog: createCatalogFor({ state }),
		org: atomOrg,
		logOffset: 1n,
		readAt,
		customerVersion: 0n,
	};
};

export const latestApiVersion = new ApiVersionClass(LATEST_VERSION);
export const oldestApiVersion = new ApiVersionClass(ApiVersion.V0_2);

export const checkRequestFor = ({
	params = {},
	query = {},
	apiVersion = latestApiVersion,
}: {
	params?: Partial<CheckRequest["params"]>;
	query?: CheckRequest["query"];
	apiVersion?: ApiVersionClass | null;
} = {}): CheckRequest => ({
	requestId: "req_check_1",
	occurredAt,
	params: { customer_id: "cus_1", feature_id: "messages", ...params },
	query,
	apiVersion,
});

export const forwardReasonOf = async (
	run: () => unknown,
): Promise<ForwardReason | null> => {
	try {
		await run();
		return null;
	} catch (error) {
		if (error instanceof CannotAnswerError) return error.reason;
		throw error;
	}
};

const noOtherThread = ({ thread }: { thread: number }): never => {
	throw new Error(`No thread ${thread}: this Atom runs in one thread`);
};

export const allSlotsOwnedHere: SlotOwners = {
	index: 0,
	threads: 1,
	ownerOf: () => 0,
	processorOn: noOtherThread,
	catalogOn: noOtherThread,
	listSinceOn: noOtherThread,
	digestSinceOn: noOtherThread,
	fetchSubjectsOn: noOtherThread,
};

export const freshHeld = () =>
	createHeldSubjects({ budgetBytes: 64 * 1024 * 1024 });

export const noFolderPulls: FolderSubjectPulls = { request() {} };

export const loopOnTime = { lagMs: () => 0 };

export const noReplication: Replication = {
	replicate() {},
	peers: async () => [],
	stop: async () => {},
};
export const noPeer = { port: 0 };

export const noSubjectPulls: SubjectPulls = {
	forFolder: () => noFolderPulls,
	stop() {},
};
