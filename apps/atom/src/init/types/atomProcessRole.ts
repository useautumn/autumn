/** What one Atom process does: serve checks on the shared port, apply Autumn's pushes, or both. */
export type AtomProcessRole = {
	servesChecks: boolean;
	receivesPushes: boolean;
};
