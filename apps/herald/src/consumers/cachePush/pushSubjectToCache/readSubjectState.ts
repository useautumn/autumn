import {
	type MeteringIdentity,
	orgToCommandOrg,
	parseReadSubjectStateCommand,
} from "@autumn/balance-engine";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { Organization } from "@autumn/shared";
import type { CachePushContext } from "../types/cachePushContext.js";

/** The subject as its worker holds it now, at or past the record that moved it. */
export const readSubjectState = ({
	ctx,
	identity,
	org,
}: {
	ctx: CachePushContext;
	identity: MeteringIdentity;
	org: Organization;
}): Promise<ReadSubjectStateReply> =>
	ctx.balanceWorkerClient.readSubjectState({
		command: parseReadSubjectStateCommand({
			input: {
				schemaVersion: 1,
				requestId: `herald_cache_push_${crypto.randomUUID()}`,
				identity,
				occurredAt: Date.now(),
				type: "readSubjectState",
				org: orgToCommandOrg({ org }),
			},
		}),
	});
