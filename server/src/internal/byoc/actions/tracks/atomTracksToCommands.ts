import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import type { AtomTracksAppendRequest } from "@autumn/byoc";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

/** Each journaled command, stamped with the Atom, its journal and its seq; null when any is not a track of the Atom's own org and env. */
export const atomTracksToCommands = ({
	atom,
	request: { writer, tracks },
}: {
	atom: AtomHonoEnv["Variables"]["atom"];
	request: AtomTracksAppendRequest;
}): TrackCommand[] | null => {
	try {
		const commands = tracks.map((track) => ({
			...parseTrackCommand({ input: track.command }),
			// The contract guarantees one of the two.
			source: {
				atomId: atom.id,
				writerId: (track.writer ?? writer) as string,
				seq: track.seq,
			},
		}));
		const isAtomsOwn = ({ identity }: TrackCommand) =>
			identity.orgId === atom.orgId && identity.env === atom.env;
		return commands.every(isAtomsOwn) ? commands : null;
	} catch {
		return null;
	}
};
