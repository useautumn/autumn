import {
	type FinalizeCommand,
	orgToCommandOrg,
	type TrackCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import { ATOM_TOKEN_HASH_HEADER } from "@autumn/byoc";
import { TestFeature } from "@tests/setup/v2Features.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/** The worker's own track for `value` messages, as an Atom journals it: under the client's Idempotency-Key when it sent one. */
export const atomTrack = ({
	customerId,
	value,
	idempotencyKey,
	lock,
}: {
	customerId: string;
	value: number;
	idempotencyKey?: string;
	/** Opens this lock over the deduction, as a check with `lock` does. */
	lock?: TrackCommand["lock"];
}): TrackCommand => {
	const requestId = `atom_req_${crypto.randomUUID()}`;
	const messages = defaultCtx.features.find(
		(feature) => feature.id === TestFeature.Messages,
	);
	return {
		schemaVersion: 1,
		requestId,
		identity: {
			orgId: defaultCtx.org.id,
			env: defaultCtx.env,
			customerId,
			entityId: null,
		},
		occurredAt: Date.now(),
		type: "track",
		org: orgToCommandOrg({ org: defaultCtx.org }),
		commandId: requestId,
		featureId: TestFeature.Messages,
		internalFeatureId: messages?.internal_id ?? "",
		value,
		overageBehavior: "overflow",
		properties: null,
		enforceOverdueBlock: true,
		usageEvent: null,
		idempotency: {
			key: idempotencyKey ?? `track:${requestId}`,
			ttlMs: 86_400_000,
		},
		...(lock && { lock }),
	};
};

/** The Atom's release of `lock`, as it journals the finalize of a lock it took. */
export const atomRelease = ({
	lock,
}: {
	lock: WorkerLock;
}): FinalizeCommand => {
	const requestId = `atom_release_${crypto.randomUUID()}`;
	return {
		schemaVersion: 1,
		requestId,
		identity: {
			orgId: lock.org_id,
			env: lock.env,
			customerId: lock.customer_id,
			entityId: lock.entity_id,
		},
		occurredAt: Date.now(),
		type: "finalize",
		org: orgToCommandOrg({ org: defaultCtx.org }),
		commandId: requestId,
		lock,
		internalFeatureId:
			defaultCtx.features.find((feature) => feature.id === lock.feature_id)
				?.internal_id ?? "",
		finalValue: 0,
		properties: null,
	};
};

/** A request to one of the Atom's own routes on Autumn, proven by its token hash. */
export const postAsAtom = ({
	autumn,
	path,
	tokenHash,
	body,
}: {
	autumn: AutumnInt;
	path: string;
	tokenHash: string;
	body: unknown;
}) =>
	fetch(`${autumn.baseUrl.replace(/\/v1$/, "")}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[ATOM_TOKEN_HASH_HEADER]: tokenHash,
		},
		body: JSON.stringify(body),
	});
