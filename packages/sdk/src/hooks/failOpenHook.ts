import type { SDKOptions } from "../lib/config.js";
import { HTTPClient } from "../lib/http.js";
import type {
	AfterErrorContext,
	AfterErrorHook,
	Awaitable,
	SDKInitHook,
} from "./types.js";

const FAIL_OPEN_OPERATION_IDS = new Set([
	"check",
	"track",
	"getOrCreateCustomer",
]);

const FAIL_OPEN_LOG_MESSAGE =
	"[Autumn] Request failed — failing open. Learn more: https://docs.useautumn.com/documentation/fail-open";

const FAIL_OPEN_BODIES: Record<string, object> = {
	check: {
		allowed: true,
		customer_id: null,
		balance: null,
		flag: null,
	},
	track: {
		customer_id: null,
		value: 0,
		balance: null,
	},
	getOrCreateCustomer: {
		id: null,
		name: null,
		email: null,
		created_at: 0,
		fingerprint: null,
		stripe_id: null,
		env: "live",
		metadata: {},
		send_email_receipts: false,
		billing_controls: {},
		subscriptions: [],
		purchases: [],
		balances: {},
		flags: {},
	},
};

export class FailOpenHook implements SDKInitHook, AfterErrorHook {
	private enabled = true;

	sdkInit(opts: SDKOptions): SDKOptions {
		if (opts.failOpen === false) {
			this.enabled = false;
			return opts;
		}

		this.enabled = true;

		opts.httpClient = new HTTPClient({
			fetcher: async (input, init) => {
				try {
					return init == null ? await fetch(input) : await fetch(input, init);
				} catch {
					return new Response(null, {
						status: 503,
						statusText: "Autumn Unreachable",
					});
				}
			},
		});

		return opts;
	}

	afterError(
		hookCtx: AfterErrorContext,
		response: Response | null,
		error: unknown,
	): Awaitable<{ response: Response | null; error: unknown }> {
		if (!this.enabled) {
			return { response, error };
		}

		if (!response || response.status < 500) {
			return { response, error };
		}

		if (!FAIL_OPEN_OPERATION_IDS.has(hookCtx.operationID)) {
			return { response, error };
		}

		const body = FAIL_OPEN_BODIES[hookCtx.operationID];
		if (!body) {
			return { response, error };
		}

		console.error(FAIL_OPEN_LOG_MESSAGE);
		console.error(
			`  Operation: ${hookCtx.operationID} | Status: ${response.status} | Error: ${error ?? "Server error"}`,
		);

		return {
			response: new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
			error: null,
		};
	}
}
