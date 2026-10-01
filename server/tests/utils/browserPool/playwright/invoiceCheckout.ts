import type { Page } from "playwright-core";

// Kept self-contained because the remote browser executor serializes this function.
export const invoiceCheckout = async ({
	page,
	url,
	label = "",
}: {
	page: Page;
	url: string;
	label?: string;
}) => {
	page.setDefaultTimeout(15_000);
	const diagStart = Date.now();
	const diagNet: string[] = [];
	let diagConfirmed = false;
	page.on("response", async (response) => {
		const reqUrl = response.url();
		if (!/stripe\.com|stripe\.network|link\.com/.test(reqUrl)) return;
		if (/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(reqUrl)) return;
		const method = response.request().method();
		if (/r\.stripe\.com|m\.stripe\.com|errors\.stripe/.test(reqUrl)) return;
		if (method === "GET" && !/api\.stripe\.com|merchant-ui|invoice/.test(reqUrl)) return;
		let body = "";
		if (method !== "GET" || response.status() >= 400) {
			body = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 600);
		}
		diagNet.push(`${Date.now() - diagStart}ms ${method} ${response.status()} ${reqUrl.split("?")[0]} ${body}`);
	});
	const diagDump = async (stage: string) => {
		const frameEl = page.locator('iframe[title="Secure payment input frame"]').first();
		const pageText = (await page.locator("body").innerText({ timeout: 2000 }).catch((e) => `ERR ${e}`)).replace(/\s+/g, " ").slice(0, 2500);
		const frames = [] as string[];
		for (const frame of page.frames().filter((fr) => /elements-inner-payment|universal-link/.test(fr.url()))) {
			const text = (await frame.locator("body").innerText({ timeout: 1000 }).catch(() => "")).replace(/\s+/g, " ").slice(0, 800);
			frames.push(`${frame.url().split("?")[0]} :: ${text}`);
		}
		const pf = page.frameLocator('iframe[title="Secure payment input frame"]').first();
		const inputs = await pf.locator("input").evaluateAll((els) =>
			els.map((el) => {
				const i = el as HTMLInputElement;
				return `${i.name || i.getAttribute("autocomplete") || i.type}:${i.getClientRects().length > 0 ? "vis" : "hid"}:len${i.value.length}${i.type === "checkbox" ? (i.checked ? ":checked" : ":unchecked") : ""}`;
			}),
		).catch((e) => [`ERR ${e}`]);
		const alerts = await page.locator('[role="alert"]').allTextContents().catch(() => []);
		const frameAlerts = await pf.locator('[role="alert"]').allTextContents().catch(() => []);
		const buttons = await page.locator("button").evaluateAll((els) => els.map((b) => `${(b as HTMLButtonElement).innerText.trim().slice(0, 40)}|disabled=${(b as HTMLButtonElement).disabled}`)).catch(() => []);
		console.log(`[DIAG ${label}] ${stage} t=${Date.now() - diagStart}ms url=${page.url().split("?")[0]} frameCount=${await frameEl.count()}`);
		console.log(`[DIAG ${label}] ${stage} pageText=${pageText}`);
		console.log(`[DIAG ${label}] ${stage} buttons=${JSON.stringify(buttons)}`);
		console.log(`[DIAG ${label}] ${stage} inputs=${JSON.stringify(inputs)} alerts=${JSON.stringify(alerts)} frameAlerts=${JSON.stringify(frameAlerts)}`);
		for (const f of frames) console.log(`[DIAG ${label}] ${stage} frame=${f}`);
	};
	try {
		await invoiceCheckoutInner();
	} finally {
		await diagDump("final").catch((e) => console.log(`[DIAG ${label}] dump failed ${e}`));
		for (const line of diagNet) console.log(`[DIAG ${label}] net ${line}`);
		const shot = diagConfirmed || !label.endsWith("no-pm") ? null : await page.screenshot({ fullPage: true, type: "jpeg", quality: 25 }).catch(() => null);
		if (shot) console.log(`[DIAG ${label}] SHOT_BEGIN${shot.toString("base64")}SHOT_END`);
	}
	async function invoiceCheckoutInner() {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
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
	await diagDump("loaded");
	await page.evaluate(() => {
		const w = window as unknown as { __diagLayout: string[] };
		w.__diagLayout = [];
		let last = "";
		setInterval(() => {
			const f = document.querySelector('iframe[title="Secure payment input frame"]');
			const b = document.querySelector('button[type="submit"], button.SubmitButton');
			const cur = `${Math.round(f?.getBoundingClientRect().height ?? -1)}/${Math.round(b?.getBoundingClientRect().top ?? -1)}/${Math.round(window.scrollY)}`;
			if (cur !== last) w.__diagLayout.push(`${Math.round(performance.now())}:${cur}`);
			last = cur;
		}, 20);
	});
	for (const frame of page.frames().filter((fr) => /elements-inner-payment/.test(fr.url()))) {
		await frame.evaluate(() => {
			const w = window as unknown as { __diagClicks: string[] };
			w.__diagClicks = [];
			for (const type of ["pointerdown", "click"]) {
				window.addEventListener(type, (e) => {
					const t = e.target as HTMLElement;
					const me = e as MouseEvent;
					w.__diagClicks.push(`${Math.round(performance.now())} ${type}@${me.clientX},${Math.round(me.clientY)}->${t.tagName}|${(t.innerText || t.getAttribute("aria-label") || "").slice(0, 30)}`);
				}, true);
			}
		}).catch((e) => console.log(`[DIAG ${label}] frame listener failed ${e}`));
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
	if ((await saveWithLink.isVisible()) && (await saveWithLink.isChecked())) {
		await saveWithLink.press("Space");
		await paymentFrame
			.locator('input[name="linkOptIn"]:checked')
			.waitFor({ state: "hidden" });
	}

	await diagDump("before-submit");
	const diagSubmit = page
		.locator(
			'button[type="submit"], button.SubmitButton, [data-testid="hosted-payment-submit-button"]',
		)
		.first();
	const diagFrameEl = page.locator('iframe[title="Secure payment input frame"]').first();
	const diagBoxes = async (stage: string) => {
		const b = await diagSubmit.boundingBox().catch(() => null);
		const f = await diagFrameEl.boundingBox().catch(() => null);
		const scrollY = await page.evaluate(() => window.scrollY).catch(() => -1);
		console.log(`[DIAG ${label}] boxes ${stage} t=${Date.now() - diagStart}ms scrollY=${scrollY} submit=${JSON.stringify(b)} frame=${JSON.stringify(f)}`);
	};
	await page.evaluate(() => {
		(window as unknown as { __diagClicks: string[] }).__diagClicks = [];
		for (const type of ["pointerdown", "mousedown", "click"]) {
			window.addEventListener(type, (e) => {
				const t = e.target as HTMLElement;
				const me = e as MouseEvent;
				(window as unknown as { __diagClicks: string[] }).__diagClicks.push(`${type}@${me.clientX},${me.clientY}->${t.tagName}.${t.className?.toString().slice(0, 40)}|${(t.innerText || "").slice(0, 20)}`);
			}, true);
		}
		window.addEventListener("blur", () => (window as unknown as { __diagClicks: string[] }).__diagClicks.push(`window-blur active=${document.activeElement?.tagName}.${(document.activeElement as HTMLElement)?.title}`));
	});
	await diagBoxes("pre-click");
	await diagSubmit.click();
	console.log(`[DIAG ${label}] clicked submit t=${Date.now() - diagStart}ms perf=${await page.evaluate(() => Math.round(performance.now())).catch(() => -1)}`);
	await diagBoxes("post-click");
	for (const ms of [100, 300, 700, 1500]) {
		await page.waitForTimeout(ms);
		await diagBoxes(`+${ms}`);
	}
	console.log(`[DIAG ${label}] mainClicks=${JSON.stringify(await page.evaluate(() => (window as unknown as { __diagClicks: string[] }).__diagClicks).catch(() => []))}`);
	console.log(`[DIAG ${label}] layout=${JSON.stringify(await page.evaluate(() => (window as unknown as { __diagLayout: string[] }).__diagLayout).catch(() => []))}`);
	for (const frame of page.frames().filter((fr) => /elements-inner-payment/.test(fr.url()))) {
		console.log(`[DIAG ${label}] frameClicks=${JSON.stringify(await frame.evaluate(() => (window as unknown as { __diagClicks?: string[] }).__diagClicks ?? null).catch((e) => `ERR ${e}`))}`);
	}
	// Watches for errors and a CAPTCHA; the caller asks Stripe whether the payment went through.
	const deadline = performance.now() + 10_000;
	while (performance.now() < deadline) {
		if (await paid.isVisible()) {
			diagConfirmed = true;
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
			const fields = await paymentFrame.locator("input").evaluateAll((inputs) =>
				inputs
					.filter(
						(input): input is HTMLInputElement =>
							input instanceof HTMLInputElement,
					)
					.map((input) => ({
						name: input.name,
						stableName: input.getAttribute("data-elements-stable-field-name"),
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
