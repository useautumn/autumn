import {
	type FinalizeCommand,
	parseFinalizeCommand,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { AtomTracksAppendRequest } from "@autumn/byoc";
import type { AtomHonoEnv } from "../../types/atomHonoEnv.js";

type HandedInCommand = TrackCommand | FinalizeCommand;

const parseHandedIn = ({
	command,
}: {
	command: HandedInCommand;
}): HandedInCommand =>
	command.type === "finalize"
		? parseFinalizeCommand({ input: command })
		: parseTrackCommand({ input: command });

/** Each journaled command, stamped with the Atom, its journal and its seq; null when any is not a track or finalize of the Atom's own org and env. */
export const atomTracksToCommands = ({
	atom,
	request: { tracks },
}: {
	atom: AtomHonoEnv["Variables"]["atom"];
	request: AtomTracksAppendRequest;
}): HandedInCommand[] | null => {
	try {
		const commands = tracks.map(({ writerId, seq, command }) => ({
			...parseHandedIn({ command }),
			source: { atomId: atom.id, writerId, seq },
		}));
		const isAtomsOwn = ({ identity }: HandedInCommand) =>
			identity.orgId === atom.orgId && identity.env === atom.env;
		return commands.every(isAtomsOwn) ? commands : null;
	} catch {
		return null;
	}
};
