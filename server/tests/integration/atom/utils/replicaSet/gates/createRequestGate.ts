/** A request the gate holds: how to send it on, and who is waiting for its reply. */
type HeldRequest = {
	send: () => Promise<Response>;
	reply: (response: Response) => void;
};

/** Which requests a shut gate holds, told from the body each arrived with. */
export type HoldsRequest = (body: ArrayBuffer) => boolean;

const holdsEvery: HoldsRequest = () => true;

/**
 * Holds requests while shut and sends them on one at a time, in arrival order, once opened, as a slow link delays them.
 * `answer` replies to a held request at once (the sender moves on) instead of when it is finally sent.
 * Shut with `holds`, only the requests it matches wait; every other one goes straight on.
 */
export const createRequestGate = ({
	answer,
}: {
	answer?: () => Response;
} = {}) => {
	let holds: HoldsRequest | null = null;
	const held: HeldRequest[] = [];

	function pass({
		send,
		body,
	}: {
		send: () => Promise<Response>;
		body?: ArrayBuffer;
	}) {
		const isHeld = holds !== null && (body === undefined || holds(body));
		if (!isHeld) return send();
		const replied = new Promise<Response>((reply) =>
			held.push({ send, reply }),
		);
		return answer ? Promise.resolve(answer()) : replied;
	}

	async function open(): Promise<void> {
		holds = null;
		for (let next = held.shift(); next; next = held.shift())
			next.reply(await next.send());
	}

	return {
		pass,
		shut: (matching: HoldsRequest = holdsEvery) => {
			holds = matching;
		},
		open,
		heldCount: () => held.length,
	};
};

export type RequestGate = ReturnType<typeof createRequestGate>;
