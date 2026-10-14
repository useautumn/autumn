import {
	type AtomFinalizeCommand,
	type AtomSource,
	orgToCommandOrg,
	parseAtomFinalizeCommand,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { AtomFinalize, AtomTracksAppendRequest } from "@autumn/byoc";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { featureToInternalFeatureId } from "@/internal/balances/balanceWorker/featureToInternalFeatureId.js";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

type HandedInCommand = TrackCommand | AtomFinalizeCommand;

/** An Atom's finalize names its lock as the API does; the worker settles Autumn's own row for it, never the Atom's copy. */
const finalizeToCommand = ({
	ctx,
	finalize,
	source,
}: {
	ctx: AutumnContext;
	finalize: AtomFinalize;
	source: AtomSource;
}): AtomFinalizeCommand =>
	parseAtomFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "atomFinalize",
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
			lockId: finalize.lock_id,
			featureId: finalize.feature_id,
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
