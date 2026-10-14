export type AtomPushQueue = {
	send(params: { payload: string }): Promise<void>;
};
