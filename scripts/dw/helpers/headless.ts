// Devin VMs and CI have no portless proxy and no browser, so HTTPS aliases
// resolve to nothing and the emulate daemon has nothing to serve.
export function isHeadless(): boolean {
	const flag = process.env.DW_HEADLESS;
	return flag === "1" || flag === "true";
}
