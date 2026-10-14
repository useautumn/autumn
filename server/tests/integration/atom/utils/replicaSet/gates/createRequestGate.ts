/** A request the gate holds: how to send it on, and who is waiting for its reply. */
type HeldRequest = {
	send: () => Promise<Response>;
	reply: (response: Response) => void;
};

/**
 * Holds requests while shut and sends them on one at a time, in arrival order, once opened, as a slow link delays them.
 * `answer` replies to a held request at once (the sender moves on) instead of when it is finally sent.
 */
export const createRequestGate = ({
	answer,
}: {
	answer?: () => Response;
} = {}) => {
	let shut = false;
	const held: HeldRequest[] = [];

	function pass({ send }: { send: () => Promise<Response> }) {
		if (!shut) return send();
		const replied = new Promise<Response>((reply) =>
			held.push({ send, reply }),
		);
		return answer ? Promise.resolve(answer()) : replied;
	}

	async function open(): Promise<void> {
		shut = false;
		for (let next = held.shift(); next; next = held.shift())
			next.reply(await next.send());
	}

	return {
		pass,
		shut: () => {
			shut = true;
		},
		open,
		heldCount: () => held.length,
	};
};

export type RequestGate = ReturnType<typeof createRequestGate>;
