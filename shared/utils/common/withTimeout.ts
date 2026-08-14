export const withTimeout = async <T>({
	fn,
	onTimeout,
	timeoutMessage,
	timeoutMs,
}: {
	fn: () => Promise<T>;
	onTimeout?: () => Promise<void> | void;
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
					reject(new Error(timeoutMessage || `timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				timeoutId.unref?.();
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
};
