// Devin / Cloud: no portless HTTPS aliases. Emulate is published on its own tunnel host.
export function isHeadless(): boolean {
	const flag = process.env.DW_HEADLESS;
	return flag === "1" || flag === "true";
}
