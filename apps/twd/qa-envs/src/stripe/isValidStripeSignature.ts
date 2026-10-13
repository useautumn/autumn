const TOLERANCE_S = 300;

const hex = (buf: ArrayBuffer) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Verifies a `Stripe-Signature` header (v1 HMAC-SHA256 over `${t}.${body}`). */
export async function isValidStripeSignature({
	body,
	header,
	secret,
}: {
	body: string;
	header: string | null;
	secret: string;
}): Promise<boolean> {
	if (!header) return false;
	const parts = header.split(",").map((p) => p.split("=") as [string, string]);
	const t = parts.find(([k]) => k === "t")?.[1];
	const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
	if (!t || signatures.length === 0) return false;
	if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const expected = hex(
		await crypto.subtle.sign(
			"HMAC",
			key,
			new TextEncoder().encode(`${t}.${body}`),
		),
	);
	return signatures.includes(expected);
}
