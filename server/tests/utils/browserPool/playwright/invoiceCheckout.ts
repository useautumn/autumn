import type { Page } from "playwright-core";

// Kept self-contained because the remote browser executor serializes this function.
export const invoiceCheckout = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	page.setDefaultTimeout(15_000);
	const t0 = Date.now();
	const tag = `[DIAG2 ${url.slice(-12)}]`;
	const dt = () => Date.now() - t0;
	const diagApi: string[] = [];
	page.on("response", (r) => {
		if (
			/api\.stripe\.com\/v1\/(elements|consumers|invoices\/[^/]+\/hosted$)/.test(
				r.url(),
			)
		)
			diagApi.push(
				`${dt()}ms ${r.status()} ${r.url().split("?")[0].replace("https://api.stripe.com", "")}`,
			);
	});
	const dumpLink = async () => {
		for (const fr of page
			.frames()
			.filter((f) => /elements-inner-payment/.test(f.url()))) {
			console.log(
				`${tag} linkTimeline=${JSON.stringify(await fr.evaluate(() => (window as unknown as { __lt?: string[] }).__lt ?? null).catch((e) => `ERR ${e}`))}`,
			);
		}
		console.log(`${tag} api=${JSON.stringify(diagApi)}`);
	};
	try {
		await invoiceCheckoutBody();
	} catch (error) {
		console.log(`${tag} threw at ${dt()}ms: ${String(error).slice(0, 200)}`);
		const text = (
			await page
				.locator("body")
				.innerText({ timeout: 2000 })
				.catch((e) => `ERR ${e}`)
		)
			.replace(/\s+/g, " ")
			.slice(0, 1500);
		console.log(`${tag} pageText=${text}`);
		console.log(
			`${tag} frames=${JSON.stringify(page.frames().map((f) => f.url().split(/[?#]/)[0]))}`,
		);
		const shot = await page
			.screenshot({ fullPage: true, type: "jpeg", quality: 25 })
			.catch(() => null);
		if (shot)
			console.log(`${tag} SHOT_BEGIN${shot.toString("base64")}SHOT_END`);
		throw error;
	} finally {
		await dumpLink();
	}
	async function invoiceCheckoutBody() {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
		console.log(`${tag} goto done ${dt()}ms`);
		const paid = page
			.getByText(
				/^(invoice paid|paid|thanks for your payment|payment (successful|received))[.!]?$/i,
			)
			.first();
		const paymentFrame = page
			.frameLocator('iframe[title="Secure payment input frame"]')
			.first();
		const cardInput = paymentFrame
			.locator(
				'input[name="number"], input[data-elements-stable-field-name="cardNumber"]',
			)
			.first();
		const cardAccordion = paymentFrame.locator(
			'[role="button"][data-value="card"]',
		);
		const readyForm = paymentFrame
			.locator(
				'input[name="number"]:visible, input[data-elements-stable-field-name="cardNumber"]:visible, [role="button"][data-value="card"]:visible',
			)
			.first();
		const initialState = await Promise.race([
			paid.waitFor().then(() => "paid"),
			readyForm.waitFor().then(() => "form"),
		]);
		console.log(`${tag} initial=${initialState} ${dt()}ms`);
		for (const fr of page
			.frames()
			.filter((f) => /elements-inner-payment/.test(f.url()))) {
			await fr
				.evaluate(() => {
					const w = window as unknown as { __lt: string[] };
					w.__lt = [];
					let last = "";
					setInterval(() => {
						const cb = document.querySelector(
							'input[name="linkOptIn"]',
						) as HTMLInputElement | null;
						const ph = document.querySelector(
							'input[name="linkMobilePhone"]',
						) as HTMLInputElement | null;
						const cur = cb
							? `optIn:${cb.checked ? "on" : "off"}:${cb.getClientRects().length ? "vis" : "hid"} phone:${ph ? (ph.getClientRects().length ? "vis" : "hid") : "none"}`
							: "optIn:none";
						if (cur !== last)
							w.__lt.push(`${Math.round(performance.now())} ${cur}`);
						last = cur;
					}, 25);
				})
				.catch((e) => console.log(`${tag} sampler failed ${e}`));
		}
		if (initialState === "paid") return;
		if (!(await cardInput.isVisible())) await cardAccordion.click();

		await cardInput.pressSequentially("4242424242424242");
		await paymentFrame
			.locator(
				'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"]',
			)
			.first()
			.pressSequentially("1228");
		await paymentFrame
			.locator(
				'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"]',
			)
			.first()
			.pressSequentially("123");

		const country = paymentFrame.locator('select[name="country"]');
		if (await country.count()) await country.selectOption("US");
		const postalCode = paymentFrame
			.locator(
				'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"]',
			)
			.first();
		if (await postalCode.count()) await postalCode.fill("10001");
		const saveWithLink = paymentFrame.locator('input[name="linkOptIn"]');
		console.log(
			`${tag} link check ${dt()}ms visible=${await saveWithLink.isVisible()} checked=${await saveWithLink.isChecked().catch(() => "n/a")} framePerf=${await page
				.frames()
				.find((f) => /elements-inner-payment/.test(f.url()))
				?.evaluate(() => Math.round(performance.now()))
				.catch(() => -1)}`,
		);
		if ((await saveWithLink.isVisible()) && (await saveWithLink.isChecked())) {
			await saveWithLink.press("Space");
			await paymentFrame
				.locator('input[name="linkOptIn"]:checked')
				.waitFor({ state: "hidden" });
		}

		// A click here can land on the payment iframe while the page is still scrolling to Pay;
		// Enter goes to the focused button wherever it is on screen.
		await page
			.locator(
				'button[type="submit"], button.SubmitButton, [data-testid="hosted-payment-submit-button"]',
			)
			.first()
			.press("Enter");
		console.log(
			`${tag} entered ${dt()}ms framePerf=${await page
				.frames()
				.find((f) => /elements-inner-payment/.test(f.url()))
				?.evaluate(() => Math.round(performance.now()))
				.catch(() => -1)}`,
		);
		// Watches for errors and a CAPTCHA; the caller asks Stripe whether the payment went through.
		const deadline = performance.now() + 10_000;
		while (performance.now() < deadline) {
			if (await paid.isVisible()) {
				console.log("[invoiceCheckout] Payment confirmed by hosted page");
				return;
			}
			for (const frame of page.frames()) {
				if (!/^https:\/\/[^/]*hcaptcha\.com\//.test(frame.url())) continue;
				const element = await frame.frameElement();
				try {
					if (!(await element.isVisible())) continue;
					const text = await frame.locator("body").innerText({ timeout: 1000 });
					if (!/\bverify\b|please try again/i.test(text)) continue;
					const error = new Error(
						"Stripe hosted invoice requires a CAPTCHA challenge",
					);
					error.name = "StripeBrowserChallengeError";
					throw error;
				} finally {
					await element.dispose();
				}
			}
			const errors = await paymentFrame
				.locator('[role="alert"]:visible')
				.allTextContents();
			const message = errors
				.map((text) => text.trim())
				.filter(Boolean)
				.join("; ");
			if (message) {
				const fields = await paymentFrame
					.locator("input")
					.evaluateAll((inputs) =>
						inputs
							.filter(
								(input): input is HTMLInputElement =>
									input instanceof HTMLInputElement,
							)
							.map((input) => ({
								name: input.name,
								stableName: input.getAttribute(
									"data-elements-stable-field-name",
								),
								type: input.type,
								autocomplete: input.autocomplete,
								visible: input.getClientRects().length > 0,
								checked: input.type === "checkbox" ? input.checked : undefined,
							})),
					);
				throw new Error(
					`Stripe invoice payment rejected: ${message}; fields=${JSON.stringify(fields)}`,
				);
			}
			await page.waitForTimeout(250);
		}
		console.log(
			"[invoiceCheckout] Submitted; hosted page showed no confirmation within 10000ms",
		);
	}
};
