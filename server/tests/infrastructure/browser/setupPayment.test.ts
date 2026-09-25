import { afterAll, beforeAll, expect, test } from "bun:test";
import { type Browser, chromium } from "playwright-core";
import { getChromiumPath } from "../../utils/browserPool/browserConfig";
import { setupPayment } from "../../utils/browserPool/playwright/setupPayment";

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch({
		headless: true,
		executablePath: getChromiumPath(),
		args: ["--no-sandbox"],
	});
});
afterAll(async () => browser?.close());

test.each([
	{
		name: "delayed form validation",
		validationDelayMs: 350,
		confirmationDelayMs: 0,
		responseStatus: "complete",
	},
	{
		name: "delayed confirmation",
		validationDelayMs: 0,
		confirmationDelayMs: 9000,
		responseStatus: "complete",
	},
	{
		name: "incomplete confirmation",
		validationDelayMs: 0,
		confirmationDelayMs: 0,
		responseStatus: "open",
	},
])(
	"setup payment handles $name",
	async ({ validationDelayMs, confirmationDelayMs, responseStatus }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		let confirmations = 0;
		let confirmed = false;
		const requests: Promise<void>[] = [];
		await page.route("**/*", (route) => {
			const request = (async () => {
				if (new URL(route.request().url()).pathname.endsWith("/confirm")) {
					confirmations++;
					await Bun.sleep(confirmationDelayMs);
					await route.fulfill({
						json: {
							status: responseStatus,
							setup_intent: {
								status:
									responseStatus === "complete"
										? "succeeded"
										: "requires_action",
							},
						},
						headers: { "access-control-allow-origin": "*" },
					});
					return;
				}
				await route.fulfill({
					contentType: "text/html",
					body: `<form>
					<input id="cardNumber"><input id="cardExpiry"><input id="cardCvc">
					<input id="billingName"><select id="billingCountry"><option value="US">US</option></select>
					<input id="billingPostalCode">
					<button type="submit" ${validationDelayMs ? "disabled" : ""}><span class="SubmitButton-TextContainer">Save</span></button>
				</form><script>
					const button = document.querySelector('button');
					document.querySelector('#billingPostalCode').addEventListener('input', event => {
						if (event.target.value === '10001') setTimeout(() => button.disabled = false, ${validationDelayMs});
					});
					document.querySelector('form').addEventListener('submit', async event => {
						event.preventDefault();
						button.disabled = true;
						await fetch('https://api.stripe.com/v1/payment_pages/cs_test_fixture/confirm', {method: 'POST'});
						button.textContent = 'Processing';
					});
				</script>`,
				});
			})();
			requests.push(request);
			return request;
		});
		page.on("response", (response) => {
			if (new URL(response.url()).pathname.endsWith("/confirm"))
				confirmed = true;
		});
		try {
			const completion = setupPayment({
				page,
				url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
			});
			if (responseStatus === "complete") await completion;
			else
				await expect(completion).rejects.toThrow(
					"session=open, setup=requires_action",
				);
			expect(confirmations).toBe(1);
			expect(confirmed).toBe(true);
		} finally {
			await Promise.allSettled(requests);
			await context.close();
		}
	},
	30_000,
);
