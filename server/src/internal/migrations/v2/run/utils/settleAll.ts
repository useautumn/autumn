/** Waits for every promise, then throws the first rejection: siblings are
 * never left running when the caller moves on to clean up. */
export const settleAll = async <T>(promises: Promise<T>[]): Promise<T[]> => {
	const settled = await Promise.allSettled(promises);
	return settled.map((outcome) => {
		if (outcome.status === "rejected") throw outcome.reason;
		return outcome.value;
	});
};
