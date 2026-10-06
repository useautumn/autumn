/** What one Atom process does besides serving checks on the shared port: apply Autumn's queued pushes. */
export type AtomProcessRole = {
	receivesPushes: boolean;
};
