import {
	type MeteringIdentity,
	orgToCommandOrg,
	parseReadSubjectStateCommand,
} from "@autumn/balance-engine";
import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { Organization } from "@autumn/shared";
import { orgToAtomOrg } from "./orgToAtomOrg.js";
import type { AtomSubjectBody } from "./types/atomSubjectBody.js";

/**
 * The subject as its worker holds it now, as `subjects.set` takes it: herald pushes it, an Atom pulls it.
 * Null only when the worker named no offset and the caller has none to fall back to.
 */
export const readAtomSubjectBody = async ({
	ctx,
	identity,
	org,
	requestId,
	fallbackLogOffset = null,
	customerVersion = null,
}: {
	ctx: {
		balanceWorkerClient: Pick<BalanceWorkerClient, "readSubjectState">;
	};
	identity: MeteringIdentity;
	org: Organization;
	requestId: string;
	/** The record that moved the subject, for a worker that predates the read offset. */
	fallbackLogOffset?: bigint | null;
	customerVersion?: bigint | null;
}): Promise<AtomSubjectBody | null> => {
	// Taken before the read: a catalog change that lands during it must still count as newer.
	const readAt = Date.now();
	const { state, catalog, logOffset } =
		await ctx.balanceWorkerClient.readSubjectState({
			command: parseReadSubjectStateCommand({
				input: {
					schemaVersion: 1,
					requestId,
					identity,
					occurredAt: Date.now(),
					type: "readSubjectState",
					org: orgToCommandOrg({ org }),
				},
			}),
		});
	const bodyLogOffset = logOffset ?? fallbackLogOffset?.toString();
	if (bodyLogOffset === undefined) return null;
	return {
		state,
		catalog,
		org: orgToAtomOrg({ org }),
		log_offset: bodyLogOffset,
		read_at: readAt,
		...(customerVersion !== null && {
			customer_version: customerVersion.toString(),
		}),
	};
};
