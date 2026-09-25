import defaultCtx, {
	type TestContext,
} from "../testInitUtils/createTestContext.js";
import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { setupPayment } from "./playwright/setupPayment.js";
import { playwrightPool } from "./playwrightPool.js";
import { waitForSetupPaymentMethod } from "./waitForSetupPaymentMethod.js";

/**
 * Complete a Stripe setup payment checkout form (mode: "setup").
 * Kernel mode: serializes setupPayment via fn.toString() and runs in-VM.
 * Local mode: runs setupPayment directly with a local Playwright browser.
 */
export const completeSetupPaymentFormV2 = async ({
	url,
	ctx = defaultCtx,
}: {
	url: string;
	ctx?: Pick<TestContext, "stripeCli">;
}): Promise<void> => {
	if (USE_KERNEL) {
		console.log(
			"[completeSetupPaymentFormV2] Using Kernel Playwright execution...",
		);
		const sessionId = await browserPool.getSessionId();
		await kernelExecute({
			sessionId,
			fn: setupPayment,
			args: { url },
		});
		await waitForSetupPaymentMethod({ ctx, url });
		console.log("[completeSetupPaymentFormV2] Done");
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeSetupPaymentFormV2] Using local Playwright...");
	await playwrightPool.runInPage({ fn: setupPayment, args: { url } });
	await waitForSetupPaymentMethod({ ctx, url });
	console.log("[completeSetupPaymentFormV2] Done");
};
