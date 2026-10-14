import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import type { AtomTracksAppendRequest } from "@autumn/byoc";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

/** Each journaled command, stamped with the Atom, its journal and its seq; null when any is not a track of the Atom's own org and env. */
export const atomTracksToCommands = ({
	atom,
	request: { tracks },
}: {
	atom: AtomHonoEnv["Variables"]["atom"];
	request: AtomTracksAppendRequest;
}): TrackCommand[] | null => {
	try {
		const commands = tracks.map(({ writerId, seq, command }) => ({
			...parseTrackCommand({ input: command }),
			source: { atomId: atom.id, writerId, seq },
		}));
		const isAtomsOwn = ({ identity }: TrackCommand) =>
			identity.orgId === atom.orgId && identity.env === atom.env;
		return commands.every(isAtomsOwn) ? commands : null;
	} catch {
		return null;
	}
};
