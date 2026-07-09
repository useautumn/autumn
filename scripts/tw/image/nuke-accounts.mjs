/**
 * Self-contained Stripe sub-account content NUKE for the `bun tw` pool.
 *
 * Runs in a tiny detached Modal sandbox at teardown (fire-and-forget from the
 * orchestrator) OR imported by the pool benchmark. Zero deps — raw fetch against
 * api.stripe.com — so it boots on a bare `oven/bun` registry image with no
 * install step.
 *
 * Each target `{ accountId, keyIndex }` is first marked
 * `autumn_tw_pool_state=nuking` (+ timestamp) so concurrent claims can WAIT on
 * the in-flight teardown instead of top-up-creating. Then everything a test run
 * creates ON the sub-account is deleted/deactivated (test clocks, customers —
 * which cascades their subscriptions — leftover subscriptions, prices, products,
 * coupons, billing meters), and the pool metadata flips back to `clean` on the
 * PLATFORM key so the next run can claim it.
 *
 * Env contract (standalone mode):
 *   NUKE_TARGETS  JSON: [{ "accountId": "acct_x", "keyIndex": 0 }, ...]
 *   NUKE_KEYS     JSON: ["sk_test_...", ...]  (index-aligned with keyIndex)
 *   NUKE_ACCOUNT_CONCURRENCY  optional, accounts nuked in parallel per key (default 4)
 */

const STRIPE_API = "https://api.stripe.com";
const PAGE_LIMIT = 100;
/** Re-list + delete passes per resource before giving up (list-while-deleting). */
const MAX_PASSES = 20;
const MAX_RETRIES = 6;
const DELETE_CONCURRENCY = 8;

/** Count of 429 responses seen (rate-limit incidents — recorded, not engineered around). */
export const rateLimitIncidents = { count: 0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Stripe REST call with 429/5xx backoff. `accountId` adds the Stripe-Account
 * scope header; body is form-encoded key/values.
 */
const stripeRequest = async ({ key, method, path, accountId, body }) => {
	for (let attempt = 0; ; attempt++) {
		const headers = { Authorization: `Bearer ${key}` };
		if (accountId) {
			headers["Stripe-Account"] = accountId;
		}
		let encoded;
		if (body) {
			headers["Content-Type"] = "application/x-www-form-urlencoded";
			encoded = new URLSearchParams(body).toString();
		}
		const response = await fetch(`${STRIPE_API}${path}`, {
			method,
			headers,
			body: encoded,
		});
		if (response.status === 429 || response.status >= 500) {
			if (response.status === 429) {
				rateLimitIncidents.count++;
			}
			if (attempt >= MAX_RETRIES) {
				throw new Error(
					`stripe ${method} ${path}: ${response.status} after ${MAX_RETRIES} retries`,
				);
			}
			const retryAfter = Number(response.headers.get("retry-after"));
			const backoffMs =
				Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: Math.min(15_000, 500 * 2 ** attempt) +
						Math.floor(Math.random() * 250);
			await sleep(backoffMs);
			continue;
		}
		const json = await response.json();
		if (!response.ok) {
			const err = new Error(
				json?.error?.message ?? `stripe ${method} ${path}: ${response.status}`,
			);
			err.stripeCode = json?.error?.code;
			err.status = response.status;
			throw err;
		}
		return json;
	}
};

/** Map over items with bounded concurrency; collects thrown errors instead of failing. */
const boundedAll = async (items, concurrency, fn) => {
	const errors = [];
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		async () => {
			while (cursor < items.length) {
				const item = items[cursor++];
				try {
					await fn(item);
				} catch (error) {
					errors.push(error);
				}
			}
		},
	);
	await Promise.all(workers);
	return errors;
};

/**
 * List-first-page → act → repeat until the listing is empty. Handles
 * delete-while-paginating without cursor bookkeeping.
 */
const drainResource = async ({ key, accountId, listPath, act, filter }) => {
	let acted = 0;
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		const page = await stripeRequest({
			key,
			method: "GET",
			path: `${listPath}${listPath.includes("?") ? "&" : "?"}limit=${PAGE_LIMIT}`,
			accountId,
		});
		const items = (page.data ?? []).filter(filter ?? (() => true));
		if (items.length === 0) {
			return acted;
		}
		await boundedAll(items, DELETE_CONCURRENCY, async (item) => {
			await act(item);
			acted++;
		});
		if (!page.has_more && items.length === (page.data ?? []).length) {
			return acted;
		}
	}
	return acted;
};

/** Nuke ALL run-created contents of one sub-account. Returns per-resource counts. */
export const nukeAccountContents = async ({ accountId, key }) => {
	const startedAt = Date.now();
	const counts = {};

	// No webhook drain: Stripe forbids webhook endpoints on connected accounts
	// (runs receive events via the platform Connect webhook + ingress).

	// Deleting a clock cascades its customers + their subscriptions.
	counts.testClocks = await drainResource({
		key,
		accountId,
		listPath: "/v1/test_helpers/test_clocks",
		act: (clock) =>
			stripeRequest({
				key,
				method: "DELETE",
				path: `/v1/test_helpers/test_clocks/${clock.id}`,
				accountId,
			}),
	});

	// Deleting a customer cancels its subscriptions.
	counts.customers = await drainResource({
		key,
		accountId,
		listPath: "/v1/customers",
		act: (customer) =>
			stripeRequest({
				key,
				method: "DELETE",
				path: `/v1/customers/${customer.id}`,
				accountId,
			}),
	});

	counts.subscriptions = await drainResource({
		key,
		accountId,
		listPath: "/v1/subscriptions?status=all",
		filter: (sub) =>
			sub.status !== "canceled" && sub.status !== "incomplete_expired",
		act: (sub) =>
			stripeRequest({
				key,
				method: "DELETE",
				path: `/v1/subscriptions/${sub.id}`,
				accountId,
			}),
	});

	counts.prices = await drainResource({
		key,
		accountId,
		listPath: "/v1/prices?active=true",
		act: (price) =>
			stripeRequest({
				key,
				method: "POST",
				path: `/v1/prices/${price.id}`,
				accountId,
				body: { active: "false" },
			}),
	});

	// Hard-delete products where possible; ones with price history can only be deactivated.
	counts.products = await drainResource({
		key,
		accountId,
		listPath: "/v1/products?active=true",
		act: async (product) => {
			try {
				await stripeRequest({
					key,
					method: "DELETE",
					path: `/v1/products/${product.id}`,
					accountId,
				});
			} catch {
				await stripeRequest({
					key,
					method: "POST",
					path: `/v1/products/${product.id}`,
					accountId,
					body: { active: "false" },
				});
			}
		},
	});

	counts.coupons = await drainResource({
		key,
		accountId,
		listPath: "/v1/coupons",
		act: (coupon) =>
			stripeRequest({
				key,
				method: "DELETE",
				path: `/v1/coupons/${coupon.id}`,
				accountId,
			}),
	});

	counts.meters = await drainResource({
		key,
		accountId,
		listPath: "/v1/billing/meters?status=active",
		act: (meter) =>
			stripeRequest({
				key,
				method: "POST",
				path: `/v1/billing/meters/${meter.id}/deactivate`,
				accountId,
			}),
	});

	return { counts, ms: Date.now() - startedAt };
};

/** Flip the account's pool-state metadata on the PLATFORM key (no scope header). */
export const setPoolState = async ({ accountId, key, state, extra }) => {
	const body = { "metadata[autumn_tw_pool_state]": state };
	for (const [name, value] of Object.entries(extra ?? {})) {
		body[`metadata[${name}]`] = value;
	}
	await stripeRequest({
		key,
		method: "POST",
		path: `/v1/accounts/${accountId}`,
		body,
	});
};

/** Mark one target as being nuked (claims skip it; short claims WAIT on it). */
export const markNuking = ({ accountId, key }) =>
	setPoolState({
		accountId,
		key,
		state: "nuking",
		extra: { autumn_tw_nuking_at: String(Date.now()) },
	});

/** Nuke one target end-to-end: contents, then mark clean. */
export const nukeTarget = async ({ accountId, key }) => {
	const result = await nukeAccountContents({ accountId, key });
	await setPoolState({
		accountId,
		key,
		state: "clean",
		extra: { autumn_tw_nuked_at: String(Date.now()) },
	});
	return result;
};

/**
 * Reclaim pool accounts left dirty (or stuck `nuking` by a crashed nuke) longer
 * ago than `staleAfterMs`. Newest-first scan, capped, per key.
 */
const findStaleDirtyTargets = async ({ keys, staleAfterMs, knownIds }) => {
	const cutoff = Date.now() - staleAfterMs;
	const stale = [];
	const MAX_SCAN = 1000;
	await Promise.all(
		keys.map(async (key, keyIndex) => {
			let after = "";
			let scanned = 0;
			while (scanned < MAX_SCAN) {
				const page = await stripeRequest({
					key,
					method: "GET",
					path: `/v1/accounts?limit=${PAGE_LIMIT}${after ? `&starting_after=${after}` : ""}`,
				});
				for (const account of page.data ?? []) {
					scanned++;
					const metadata = account.metadata ?? {};
					const state = metadata.autumn_tw_pool_state;
					const staleSince = Number(
						state === "nuking"
							? metadata.autumn_tw_nuking_at
							: metadata.autumn_tw_claimed_at,
					);
					if (
						metadata.autumn_tw_pool === "1" &&
						(state === "dirty" || state === "nuking") &&
						!knownIds.has(account.id) &&
						Number.isFinite(staleSince) &&
						staleSince < cutoff
					) {
						stale.push({ accountId: account.id, keyIndex });
					}
				}
				if (!page.has_more || (page.data ?? []).length === 0) {
					break;
				}
				after = page.data[page.data.length - 1].id;
			}
		}),
	);
	return stale;
};

const main = async () => {
	const targets = JSON.parse(process.env.NUKE_TARGETS ?? "[]");
	const keys = JSON.parse(process.env.NUKE_KEYS ?? "[]");
	const perKeyConcurrency = Number(process.env.NUKE_ACCOUNT_CONCURRENCY) || 4;
	const staleAfterMs =
		Number(process.env.NUKE_STALE_AFTER_MS) || 60 * 60 * 1000;
	if (keys.length === 0) {
		console.log("[nuke] nothing to do (NUKE_KEYS empty)");
		return;
	}

	if (process.env.NUKE_STALE_SWEEP === "1") {
		const knownIds = new Set(targets.map((target) => target.accountId));
		try {
			const stale = await findStaleDirtyTargets({
				keys,
				staleAfterMs,
				knownIds,
			});
			if (stale.length > 0) {
				console.log(
					`[nuke] reclaiming ${stale.length} stale-dirty pool account(s)`,
				);
				targets.push(...stale);
			}
		} catch (error) {
			console.error(`[nuke] stale sweep failed (continuing): ${error.message}`);
		}
	}

	if (targets.length === 0) {
		console.log("[nuke] nothing to do (no targets)");
		return;
	}

	const startedAt = Date.now();
	console.log(
		`[nuke] ${targets.length} account(s) across ${keys.length} key(s)`,
	);

	// Group per key so each platform bucket gets its own bounded lane.
	const byKey = new Map();
	for (const target of targets) {
		const list = byKey.get(target.keyIndex) ?? [];
		list.push(target);
		byKey.set(target.keyIndex, list);
	}

	// Mark everything `nuking` FIRST so concurrent claims see the in-flight
	// teardown (they wait instead of top-up-creating). Best-effort per account.
	await Promise.all(
		[...byKey.entries()].map(([keyIndex, keyTargets]) =>
			boundedAll(keyTargets, perKeyConcurrency, (target) =>
				markNuking({
					accountId: target.accountId,
					key: keys[keyIndex] ?? keys[0],
				}),
			),
		),
	);
	console.log(`[nuke] marked ${targets.length} account(s) nuking`);

	let failed = 0;
	await Promise.all(
		[...byKey.entries()].map(async ([keyIndex, keyTargets]) => {
			const key = keys[keyIndex] ?? keys[0];
			const errors = await boundedAll(
				keyTargets,
				perKeyConcurrency,
				async (target) => {
					const { counts, ms } = await nukeTarget({
						accountId: target.accountId,
						key,
					});
					console.log(
						`[nuke] ${target.accountId} clean in ${ms}ms ${JSON.stringify(counts)}`,
					);
				},
			);
			failed += errors.length;
			for (const error of errors) {
				console.error(`[nuke] key ${keyIndex}: ${error.message}`);
			}
		}),
	);

	console.log(
		`[nuke] done: ${targets.length - failed}/${targets.length} clean in ${Date.now() - startedAt}ms, ${rateLimitIncidents.count} rate-limit incident(s)`,
	);
	if (failed > 0) {
		process.exitCode = 1;
	}
};

if (import.meta.main) {
	await main();
}
