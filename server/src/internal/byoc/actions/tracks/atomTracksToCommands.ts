import {
	type AtomSource,
	type FinalizeCommand,
	orgToCommandOrg,
	parseFinalizeCommand,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { AtomFinalize, AtomTracksAppendRequest } from "@autumn/byoc";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { featureToInternalFeatureId } from "@/internal/balances/balanceWorker/featureToInternalFeatureId.js";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

type HandedInCommand = TrackCommand | FinalizeCommand;

/** An Atom's finalize names its lock; the worker settles Autumn's own row for it, never the Atom's copy. */
const finalizeToCommand = ({
	ctx,
	finalize,
	source,
}: {
	ctx: AutumnContext;
	finalize: AtomFinalize;
	source: AtomSource;
}): FinalizeCommand =>
	parseFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "finalize",
			requestId: finalize.requestId,
			commandId: finalize.requestId,
			occurredAt: finalize.occurredAt,
			identity: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: finalize.customer_id,
				entityId: finalize.entity_id,
			},
			org: orgToCommandOrg({ org: ctx.org }),
			lock: null,
			lockId: finalize.lock_id,
			internalFeatureId: featureToInternalFeatureId({
				ctx,
				featureId: finalize.feature_id,
			}),
			finalValue: finalize.finalValue,
			properties: finalize.properties ?? null,
			source,
		},
	});

/** Each journaled track or finalize, stamped with the Atom, its journal and its seq, in request order; null when any is unreadable or off the Atom's own org and env. */
export const atomTracksToCommands = ({
	ctx,
	atom,
	request: { tracks },
}: {
	ctx: AutumnContext;
	atom: AtomHonoEnv["Variables"]["atom"];
	request: AtomTracksAppendRequest;
}): HandedInCommand[] | null => {
	try {
		const commands = tracks.map((handedIn): HandedInCommand => {
			const source = {
				atomId: atom.id,
				writerId: handedIn.writerId,
				seq: handedIn.seq,
			};
			if ("finalize" in handedIn)
				return finalizeToCommand({
					ctx,
					finalize: handedIn.finalize,
					source,
				});
			return { ...parseTrackCommand({ input: handedIn.command }), source };
		});
		const isAtomsOwn = ({ identity }: HandedInCommand) =>
			identity.orgId === atom.orgId && identity.env === atom.env;
		return commands.every(isAtomsOwn) ? commands : null;
	} catch {
		return null;
	}
};
