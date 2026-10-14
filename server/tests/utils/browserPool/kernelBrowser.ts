import Kernel from "@onkernel/sdk";
import {
	HEADLESS,
	KERNEL_TIMEOUT_SECONDS,
	USE_KERNEL,
} from "./browserConfig.js";

export const kernel = USE_KERNEL ? new Kernel() : null;

console.log(
	`[KernelBrowser] USE_KERNEL=${USE_KERNEL}, HEADLESS=${HEADLESS}, KERNEL_API_KEY=${process.env.KERNEL_API_KEY ? "set" : "NOT SET"}`,
);

export const createKernelSession = async (): Promise<string> => {
	if (!kernel) {
		throw new Error(
			"createKernelSession requires Kernel — USE_KERNEL is false",
		);
	}

	console.log("[KernelBrowser] Creating Kernel browser session...");
	const kernelBrowser = await kernel.browsers.create({
		headless: HEADLESS,
		timeout_seconds: KERNEL_TIMEOUT_SECONDS,
	});
	console.log(
		`[KernelBrowser] Session created: sessionId=${kernelBrowser.session_id}`,
	);
	return kernelBrowser.session_id;
};

export const createKernelBrowser = async (): Promise<{
	sessionId: string;
	cdpWsUrl: string;
}> => {
	if (!kernel) {
		throw new Error(
			"createKernelBrowser requires Kernel — USE_KERNEL is false",
		);
	}

	console.log("[KernelBrowser] Creating Kernel cloud browser...");
	const kernelBrowser = await kernel.browsers.create({
		headless: HEADLESS,
		timeout_seconds: KERNEL_TIMEOUT_SECONDS,
	});
	console.log(
		`[KernelBrowser] Browser created: sessionId=${kernelBrowser.session_id}`,
	);
	return {
		sessionId: kernelBrowser.session_id,
		cdpWsUrl: kernelBrowser.cdp_ws_url,
	};
};

export const deleteKernelSession = async ({
	sessionId,
}: {
	sessionId: string;
}): Promise<void> => {
	if (!kernel) return;
	try {
		await kernel.browsers.deleteByID(sessionId);
	} catch {}
};
