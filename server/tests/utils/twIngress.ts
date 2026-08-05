/**
 * Register a MID-RUN Stripe Connect account with the `bun tw` webhook ingress.
 *
 * Under `bun tw` there is ONE shared platform Connect webhook per Stripe pool key,
 * pointed at the ingress sandbox (`scripts/tw/ingress/server.mjs`). The ingress
 * fans each event to the owning worker by `event.account`, using a routing table
 * the orchestrator fills in at worker boot — with exactly one entry per worker:
 * the sub-account it was provisioned with.
 *
 * A test that provisions a platform sub-org (`s.platform.create` →
 * `POST /platform/organizations` → `provisionSubOrg` → `createConnectAccount`)
 * mints a BRAND-NEW Connect account inside the µVM, long after boot. Its events
 * do reach the ingress (the account was created on the worker's own pool key, and
 * that key's webhook points here) but match no route, so they are dropped — every
 * such test then runs with ZERO Stripe webhooks, and Autumn-side state that only
 * a webhook advances (an invoice stuck in `draft`, a subscription never marked
 * paid) never settles.
 *
 * The orchestrator cannot register the account: it never sees it. The test process
 * can — it knows the `acct_*` the moment it is created, and `bun tw` hands it the
 * ingress URL/token plus its own worker URL (see `twIngressEnv` in
 * `scripts/tw/helpers/remoteExecutor.ts`). So the test posts the SAME
 * `{ accountId, workerUrl }` payload the orchestrator pushes at boot — one extra
 * entry in the existing map, no new routing semantics.
 *
 * Outside `bun tw` (local `bun t`, a dev server run) the env is absent and this is
 * a no-op: locally there is no ingress and webhooks are delivered directly.
 */

/** Attempts before giving up (the ingress is a single tiny http server). */
const REGISTER_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Point the tw ingress at THIS worker for `accountId`.
 *
 * @returns `true` if a route was registered, `false` when not running under
 *   `bun tw` (nothing to do).
 * @throws if running under `bun tw` and the registration fails — failing here with
 *   a precise message beats the alternative, which is a webhook-starved test
 *   timing out on an assertion minutes later with no hint why.
 */
export const registerTwIngressRoute = async ({
	accountId,
	label,
}: {
	accountId: string;
	/** Human context for the error message (e.g. the sub-org slug). */
	label?: string;
}): Promise<boolean> => {
	const ingressUrl = process.env.TW_INGRESS_URL;
	const token = process.env.TW_INGRESS_TOKEN;
	const workerUrl = process.env.TW_WORKER_URL;

	if (!(ingressUrl && token && workerUrl)) {
		return false;
	}

	const context = label ? ` (${label})` : "";
	let lastError = "";

	for (let attempt = 1; attempt <= REGISTER_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(`${ingressUrl}/ingress/map`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-ingress-token": token,
				},
				body: JSON.stringify({ accountId, workerUrl }),
			});

			if (response.ok) {
				return true;
			}

			lastError = `${response.status} ${await response.text().catch(() => "")}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}

		if (attempt < REGISTER_ATTEMPTS) {
			await sleep(RETRY_DELAY_MS * attempt);
		}
	}

	throw new Error(
		`[tw-ingress] failed to register Connect account ${accountId}${context} with the tw ingress at ${ingressUrl}: ${lastError}. ` +
			`Without this route the ingress drops every Stripe webhook for that account and the test will hang on state a webhook advances.`,
	);
};
