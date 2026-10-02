let tail: Promise<void> = Promise.resolve();

/** FIFO lease on the one stripe-connect account: its webhook fallback route can only point at one run's worker. */
export const acquireStripeConnectLease = (): Promise<() => void> => {
	let release = () => {};
	const held = new Promise<void>((resolveHeld) => {
		release = resolveHeld;
	});
	const granted = tail.then(() => release);
	tail = tail.then(() => held);
	return granted;
};
