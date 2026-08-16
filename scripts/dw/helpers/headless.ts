// Devin / Cloud: no portless HTTPS aliases. Emulate runs on loopback and is
// exposed via the path proxy at /emulate when ngrok is up.
export function isHeadless(): boolean {
	const flag = process.env.DW_HEADLESS;
	return flag === "1" || flag === "true";
}
