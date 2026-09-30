import type {
	AtomClient,
	AtomConnection,
	AtomSubjectBody,
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
	timeoutMs: number;
};

const setSubject = async ({
	ctx,
	body,
}: {
	ctx: AtomClientContext;
	body: AtomSubjectBody;
}): Promise<void> => {
	const url = new URL("/v1/subjects.set", ctx.endpointUrl);
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": ctx.token,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(ctx.timeoutMs),
	});
	if (!response.ok)
		throw new AtomRequestError({ url, status: response.status });
};

/** The token is opened once, here; a connection whose token cannot be opened throws. */
export const createAtomClient = ({
	connection,
	config,
}: {
	connection: AtomConnection;
	config: { timeoutMs: number; decrypt: (encrypted: string) => string };
}): AtomClient => {
	const ctx = {
		endpointUrl: connection.endpointUrl,
		token: config.decrypt(connection.encryptedToken),
		timeoutMs: config.timeoutMs,
	};
	return {
		setSubject: (params) => setSubject({ ctx, ...params }),
	};
};
