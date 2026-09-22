/** `timeoutError` lets a caller distinguish a stall from the wrapped
 * function's own failures. */
export const withTimeout = async <T>({
	fn,
	onTimeout,
	timeoutError,
	timeoutMessage,
	timeoutMs,
}: {
	fn: () => Promise<T>;
	onTimeout?: () => Promise<void> | void;
	timeoutError?: (message: string) => Error;
	timeoutMessage?: string;
	timeoutMs: number;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					void Promise.resolve(onTimeout?.());
					const message = timeoutMessage || `timed out after ${timeoutMs}ms`;
					reject(timeoutError ? timeoutError(message) : new Error(message));
				}, timeoutMs);
				timeoutId.unref?.();
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};
