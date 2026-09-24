export const registerTwStripeAccount = async ({
	accountId,
}: {
	accountId: string;
}): Promise<void> => {
	if (
		process.env.TW_WORKER_MODE !== "1" ||
		process.env.NODE_ENV === "production"
	)
		return;
	const ingressUrl = process.env.TW_STRIPE_INGRESS_URL;
	const token = process.env.TW_STRIPE_INGRESS_TOKEN;
	const workerAccountId = process.env.STRIPE_ACCOUNT_ID;
	if (!ingressUrl || !token || !workerAccountId)
		throw new Error(
			"TW Stripe webhook routing is not configured for this worker",
		);

	const response = await fetch(`${ingressUrl}/ingress/map`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-ingress-token": token },
		body: JSON.stringify({ accountId, workerAccountId }),
		signal: AbortSignal.timeout(10_000),
	});
	await response.text();
	if (!response.ok)
		throw new Error(
			`TW Stripe account registration failed: HTTP ${response.status}`,
		);
};
