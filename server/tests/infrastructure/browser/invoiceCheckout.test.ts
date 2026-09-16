import { afterAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import { getChromiumPath } from "../../utils/browserPool/browserConfig";
import { invoiceCheckout } from "../../utils/browserPool/playwright/invoiceCheckout";

const browser = await chromium.launch({
	headless: true,
	executablePath: getChromiumPath(),
	args: ["--no-sandbox"],
});
afterAll(() => browser.close());

const createInvoicePage = async ({
	outcome,
}: {
	outcome: "paid" | "challenge" | "invalid";
}) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	let submissions = 0;
	await page.route("**/*", async (route) => {
		const url = new URL(route.request().url());
		if (url.hostname === "newassets.hcaptcha.com") {
			await route.fulfill({
				contentType: "text/html",
				body: "Please try again. Verify",
			});
		} else if (url.pathname === "/payment") {
			await Bun.sleep(200);
			await route.fulfill({
				contentType: "text/html",
				body: `<button role="button" data-value="card" onclick="document.querySelector('form').hidden=false; this.remove()">Card</button>
			<form hidden><input name="number"><input name="expiry"><input name="cvc"><input name="postalCode"></form>
			<script>
			window.addEventListener('message', () => {
				const values = [...document.querySelectorAll('input')].map(input => input.value);
				if (JSON.stringify(values) !== JSON.stringify(['4242424242424242','1228','123','10001'])) throw Error('Incomplete form');
				${outcome === "invalid" ? "document.body.insertAdjacentHTML('beforeend', '<div role=alert>Your card was declined</div>');" : "parent.postMessage('submitted', '*');"}
			});
			</script>`,
			});
		} else if (url.pathname === "/submitted") {
			submissions++;
			await route.fulfill({ json: {} });
		} else {
			await route.fulfill({
				contentType: "text/html",
				body: `<p>Unpaid</p><p>Previously paid invoices</p>
			<button type="submit" disabled>Pay</button>
			<script>
			setTimeout(() => {
				const iframe = document.createElement('iframe');
				iframe.title = 'Secure payment input frame'; iframe.src = '/payment';
				document.body.append(iframe);
				iframe.onload = () => document.querySelector('button').disabled = false;
			}, 200);
			document.querySelector('button').onclick = () => document.querySelector('iframe').contentWindow.postMessage('pay', '*');
			window.addEventListener('message', async ({data}) => {
				if (data !== 'submitted') return;
				await fetch('/submitted');
				${outcome === "challenge" ? "document.body.insertAdjacentHTML('beforeend', '<iframe src=https://newassets.hcaptcha.com/challenge></iframe>');" : "document.body.insertAdjacentHTML('beforeend', '<h1>Paid</h1>');"}
			});
			</script>`,
			});
		}
	});
	return { context, page, getSubmissions: () => submissions };
};

test("invoice checkout waits for a delayed frame and collapsed card form, then confirms payment", async () => {
	const fixture = await createInvoicePage({ outcome: "paid" });
	try {
		await invoiceCheckout({
			page: fixture.page,
			url: "https://invoice.fixture/",
		});
		expect(fixture.getSubmissions()).toBe(1);
		expect(
			await fixture.page.getByText("Paid", { exact: true }).isVisible(),
		).toBe(true);
	} finally {
		await fixture.context.close();
	}
}, 10_000);

test("a visible CAPTCHA fails promptly with a distinct challenge error", async () => {
	const fixture = await createInvoicePage({ outcome: "challenge" });
	try {
		await expect(
			invoiceCheckout({ page: fixture.page, url: "https://invoice.fixture/" }),
		).rejects.toMatchObject({ name: "StripeBrowserChallengeError" });
		expect(fixture.getSubmissions()).toBe(1);
	} finally {
		await fixture.context.close();
	}
}, 10_000);

test("payment errors inside the frame fail instead of waiting for a success timeout", async () => {
	const fixture = await createInvoicePage({ outcome: "invalid" });
	try {
		await expect(
			invoiceCheckout({ page: fixture.page, url: "https://invoice.fixture/" }),
		).rejects.toThrow("Your card was declined");
		expect(fixture.getSubmissions()).toBe(0);
	} finally {
		await fixture.context.close();
	}
}, 10_000);
