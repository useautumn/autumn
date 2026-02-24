import { KERNEL_EXECUTE_TIMEOUT_SEC } from "./browserConfig.js";
import { kernel } from "./kernelBrowser.js";

/**
 * Execute a self-contained Playwright function inside a Kernel browser VM.
 *
 * Serializes the function via fn.toString() (Bun strips TS types automatically),
 * wraps it in a Kernel execution template that creates a new page from context,
 * calls the function, and closes the page.
 *
 * The function MUST NOT reference any external imports — it runs in isolation
 * inside the Kernel VM with only `page`, `context`, and `browser` available.
 */
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

	// Build code that:
	// 1. Creates a new page from the Kernel context (isolation for concurrent tests)
	// 2. Calls the serialized function with { page, ...args }
	// 3. Closes the page in a finally block
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
