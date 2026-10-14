let tail: Promise<void> = Promise.resolve();

export const acquireStripeConnectLease = (): Promise<() => void> => {
	let release = () => {};
	const held = new Promise<void>((resolveHeld) => {
		release = resolveHeld;
	});
	const granted = tail.then(() => release);
	tail = tail.then(() => held);
	return granted;
};
