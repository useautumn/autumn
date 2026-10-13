import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import type { AtomTracksAppendRequest } from "@autumn/byoc";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

/** Each journaled command, stamped with the Atom that granted it and its seq; null when any is not a track of the Atom's own org and env. */
export const atomTracksToCommands = ({
	atom,
	tracks,
}: {
	atom: AtomHonoEnv["Variables"]["atom"];
	tracks: AtomTracksAppendRequest["tracks"];
}): TrackCommand[] | null => {
	try {
		const commands = tracks.map(({ seq, command }) => ({
			...parseTrackCommand({ input: command }),
			source: { atomId: atom.id, seq },
		}));
		const isAtomsOwn = ({ identity }: TrackCommand) =>
			identity.orgId === atom.orgId && identity.env === atom.env;
		return commands.every(isAtomsOwn) ? commands : null;
	} catch {
		return null;
	}
};
