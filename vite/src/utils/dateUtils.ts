export const unixHasPassed = (unix: number) => {
	return unix < Date.now();
};
