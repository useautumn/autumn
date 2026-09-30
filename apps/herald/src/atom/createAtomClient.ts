import { retryWithBackoff } from "./retryWithBackoff.js";
import type {
	AtomClient,
	AtomConnection,
	AtomDelivery,
} from "./types/atomClient.js";

export class AtomRequestError extends Error {
	readonly status: number;

	constructor({ url, status }: { url: URL; status: number }) {
		super(`Atom answered ${status} to ${url.pathname}`);
		this.name = "AtomRequestError";
		this.status = status;
	}
}

type AtomClientContext = {
	endpointUrl: string;
	token: string;
	subjects: AtomDelivery;
	catalog: AtomDelivery;
};

/** A refusal (4xx) will be refused again; a timeout, a dropped connection or a 5xx can recover. */
const isRecoverable = (error: unknown): boolean =>
	!(error instanceof AtomRequestError) || error.status >= 500;

const postOnce = async ({
	ctx,
	path,
	body,
	timeoutMs,
}: {
	ctx: AtomClientContext;
	path: string;
	body: unknown;
	timeoutMs: number;
}): Promise<void> => {
	const url = new URL(path, ctx.endpointUrl);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": ctx.token,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!response.ok)
		throw new AtomRequestError({ url, status: response.status });
};

/** The one way anything reaches an Atom: what differs per push is only how hard it is tried. */
const postToAtom = ({
	ctx,
	path,
	body,
	delivery,
}: {
	ctx: AtomClientContext;
	path: string;
	body: unknown;
	delivery: AtomDelivery;
}): Promise<void> => {
	const run = () =>
		postOnce({ ctx, path, body, timeoutMs: delivery.timeoutMs });
	if (!delivery.retry) return run();
	return retryWithBackoff({
		policy: delivery.retry,
		run,
		shouldRetry: isRecoverable,
	});
};

/** The token is opened once, here; a connection whose token cannot be opened throws. */
export const createAtomClient = ({
	connection,
	config,
}: {
	connection: AtomConnection;
	config: {
		decrypt: (encrypted: string) => string;
		subjects: AtomDelivery;
		catalog: AtomDelivery;
	};
}): AtomClient => {
	const ctx = {
		endpointUrl: connection.endpointUrl,
		token: config.decrypt(connection.encryptedToken),
		subjects: config.subjects,
		catalog: config.catalog,
	};
	return {
		setSubject: ({ body }) =>
			postToAtom({
				ctx,
				path: "/v1/subjects.set",
				body,
				delivery: ctx.subjects,
			}),
		setCatalog: ({ rows, readAt }) =>
			postToAtom({
				ctx,
				path: "/v1/catalog.set",
				body: { rows, read_at: readAt },
				delivery: ctx.catalog,
			}),
	};
};
