export const withTimeout = async <T>({
	timeoutMs,
	fn,
	timeoutMessage,
	onTimeout,
}: {
	timeoutMs: number;
	fn: () => Promise<T>;
	timeoutMessage?: string;
	onTimeout?: () => void | Promise<void>;
}): Promise<T> => {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			fn(),
			new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					void Promise.resolve(onTimeout?.());
					reject(new Error(timeoutMessage || `timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				timeoutId.unref?.();
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};
