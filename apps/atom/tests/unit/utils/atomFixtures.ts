import { createSubjectState } from "@autumn/balance-engine";
import {
	ApiVersion,
	ApiVersionClass,
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
import type { StoredSubject } from "../../../src/state/types/storedSubject.js";

/** The org settings Autumn sends with every subject. */
export const atomOrg: SharedContext["org"] = {
	config: OrgConfigSchema.parse({}),
	default_currency: "usd",
};

/** The fixture customer `cus_1` holding `balance` messages, as Autumn sends it. */
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

/** A stored subject as Autumn pushes it: routed by its customer, the body as JSON text. */
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
	}),
});

/** The fixture customer `cus_1` holding `balance` messages, as Atom stores it. */
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
	};
};

/**
 * `cus_1` as Autumn sends it for its entity `ent_42`: the customer's own messages and the entity's own,
 * in one view under the entity's identity.
 */
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
	};
};

export const latestApiVersion = new ApiVersionClass(LATEST_VERSION);
export const oldestApiVersion = new ApiVersionClass(ApiVersion.V0_2);

/** A check on `cus_1`'s messages as a caller on the latest API version sends it. */
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

/** The reason `run` left its request to the API; null when it answered itself. */
export const forwardReasonOf = (run: () => unknown): ForwardReason | null => {
	try {
		run();
		return null;
	} catch (error) {
		if (error instanceof CannotAnswerError) return error.reason;
		throw error;
	}
};
