/**
 * The highest-indexed threads receive pushes: slots go to threads round-robin from 0, so with a remainder
 * the lowest-indexed threads own one slot more, and receiving is kept off them.
 */
export const receivesPushes = ({
	index,
	threads,
	receivers,
}: {
	index: number;
	threads: number;
	receivers: number;
}): boolean => index >= threads - receivers;
