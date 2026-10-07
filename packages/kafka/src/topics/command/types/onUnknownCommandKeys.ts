/** Told which keys of a queued command were dropped: a newer server sent fields this worker does not know. */
export type OnUnknownCommandKeys = (params: {
	commandType: string;
	keyPaths: string[];
}) => void;
