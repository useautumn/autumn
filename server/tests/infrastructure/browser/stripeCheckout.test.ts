import { expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { getChromiumPath } from "../../utils/browserPool/browserConfig";
import { stripeCheckout } from "../../utils/browserPool/playwright/stripeCheckout";

test("checkout waits for the quantity-update overlay before submitting", async () => {
	const browser = await chromium.launch({
		headless: true,
		executablePath: getChromiumPath(),
		args: ["--no-sandbox"],
	});
	const context = await browser.newContext();
	const page = await context.newPage();
	let updates = 0;
	let confirmations = 0;
	await page.route("**/*", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === "/quantity") {
			updates++;
			await Bun.sleep(3000);
			await route.fulfill({ json: { quantity: 4 } });
		} else if (path === "/confirm") {
			confirmations++;
			await route.fulfill({ json: { status: "complete" } });
		} else if (path === "/complete") {
			await route.fulfill({
				contentType: "text/html",
				body: "Payment complete",
			});
		} else {
			await route.fulfill({
				contentType: "text/html",
				body: `<form>
				<input id="cardNumber"><input id="cardExpiry"><input id="cardCvc">
				<input id="billingName"><select id="billingCountry"><option value="US">US</option></select>
				<input id="billingPostalCode">
				<button type="button" class="AdjustableQuantitySelector">Qty 2</button>
				<button type="submit" class="SubmitButton"><span class="SubmitButton-TextContainer">Subscribe</span></button>
			</form>
			<div id="overlay" hidden style="position:fixed;inset:0;background:white;z-index:10">
				<input id="adjustQuantity" value="2"><button class="AdjustQuantityFooter-btn">Update</button>
			</div>
			<script>
				let updating = false;
				const overlay = document.querySelector('#overlay');
				document.querySelector('.AdjustableQuantitySelector').onclick = () => overlay.hidden = false;
				document.querySelector('.AdjustQuantityFooter-btn').onclick = async () => {
					updating = true;
					await fetch('/quantity', {method:'POST'});
					updating = false;
					overlay.hidden = true;
				};
				document.querySelector('form').onsubmit = async event => {
					event.preventDefault();
					if (updating) return;
					await fetch('/confirm', {method:'POST'});
					location.href = 'https://fixture.test/complete';
				};
			</script>`,
			});
		}
	});
	try {
		await stripeCheckout({
			page,
			url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
			overrideQuantity: 4,
		});
		expect(updates).toBe(1);
		expect(confirmations).toBe(1);
		expect(page.url()).toBe("https://fixture.test/complete");
	} finally {
		await browser.close();
	}
}, 20_000);
