export const isDwHeadless = (
	env: Record<string, string | undefined> = process.env,
): boolean => {
	const flag = env.DW_HEADLESS;
	return flag === "1" || flag === "true";
};
