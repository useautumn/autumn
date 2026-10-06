/** One Atom's `pushes` queue as herald sends to it: sends are batched, and each resolves once its own message is taken. */
export type AtomPushQueue = {
	send(params: { payload: string }): Promise<void>;
};
