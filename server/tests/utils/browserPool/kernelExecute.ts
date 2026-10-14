import { KERNEL_EXECUTE_TIMEOUT_SEC } from "./browserConfig.js";
import { kernel } from "./kernelBrowser.js";

export const kernelExecute = async ({
	sessionId,
	fn,
	args,
	timeoutSec = KERNEL_EXECUTE_TIMEOUT_SEC,
}: {
	sessionId: string;
	// biome-ignore lint/suspicious/noExplicitAny: must accept any serializable function signature
	fn: (...args: any[]) => Promise<any>;
	args: Record<string, unknown>;
	timeoutSec?: number;
}): Promise<void> => {
	if (!kernel) {
		throw new Error("kernelExecute requires Kernel — USE_KERNEL is false");
	}

	const fnString = fn.toString();
	const argsString = JSON.stringify(args);

	const code = `
const __fn = ${fnString};
const __args = ${argsString};
const __page = await context.newPage();
try {
	await __fn({ page: __page, ...__args });
	return { success: true };
} finally {
	await __page.close();
}
`;

	const result = await kernel.browsers.playwright.execute(sessionId, {
		code,
		timeout_sec: timeoutSec,
	});

	if (result.stdout) console.log(result.stdout);
	if (result.stderr) console.error(result.stderr);

	if (!result.success) {
		throw new Error(
			`[kernelExecute] Playwright execution failed: ${result.error}`,
		);
	}
};
