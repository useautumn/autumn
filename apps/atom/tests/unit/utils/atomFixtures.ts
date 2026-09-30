import {
	ApiVersion,
	ApiVersionClass,
	LATEST_VERSION,
	OrgConfigSchema,
	type SharedContext,
} from "@autumn/shared";
import {
	createCatalogFor,
	createState,
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
