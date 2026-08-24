/** bun-types 1.4 Process.off is only `memoryPressure`; Node signal overloads are gone. */
export const detachProcessSignal = (
	signal: NodeJS.Signals,
	handler: () => void,
): void => {
	(
		process as unknown as {
			off: (event: NodeJS.Signals, listener: () => void) => void;
		}
	).off(signal, handler);
};
