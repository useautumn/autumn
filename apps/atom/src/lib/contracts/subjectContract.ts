import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";
import { z } from "zod/v4";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import { InvalidPushError, isUnreadableRequest } from "./invalidPushError.js";
import { sentAs } from "./sentAs.js";

const stateShape = z.looseObject({
	identity: z.looseObject({
		orgId: z.string().min(1),
		env: z.string().min(1),
		customerId: z.string().min(1),
	}),
});
const catalogShape = z.looseObject({
	features: z.record(z.string(), z.unknown()),
});
const orgShape = z.looseObject({ config: z.record(z.string(), z.unknown()) });

const subjectBodySchema = z.object({
	state: sentAs<SubjectState>(stateShape),
	catalog: sentAs<Catalog>(catalogShape),
	org: sentAs<SharedContext["org"]>(orgShape),
	log_offset: z.string().regex(/^\d+$/),
	read_at: z.number().int().nonnegative(),
	customer_version: z.string().regex(/^\d+$/).optional(),
});

const parsePush = <T>(read: () => T): T => {
	try {
		return read();
	} catch (error) {
		if (!isUnreadableRequest(error)) throw error;
		throw new InvalidPushError((error as Error).message);
	}
};

export const subjectPushToStoredSubject = ({
	customerId,
	body,
}: {
	customerId: string;
	body: string;
}): StoredSubject => {
	const parsed = parsePush(() => subjectBodySchema.parse(JSON.parse(body)));
	if (parsed.state.identity.customerId !== customerId)
		throw new InvalidPushError(
			`A push routed to customer ${customerId} holds customer ${parsed.state.identity.customerId}`,
		);
	return {
		state: parsed.state,
		catalog: parsed.catalog,
		org: parsed.org,
		logOffset: BigInt(parsed.log_offset),
		readAt: parsed.read_at,
		customerVersion: BigInt(parsed.customer_version ?? 0),
	};
};
