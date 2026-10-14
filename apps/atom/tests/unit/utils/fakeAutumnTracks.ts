import { parseTrackCommand } from "@autumn/balance-engine";
import {
	ATOM_TOKEN_HASH_HEADER,
	ATOM_TRACKS_APPEND_PATH,
	AtomTracksAppendRequestSchema,
} from "@autumn/byoc";

export type AppliedTrack = {
	writer: string;
	customerId: string;
	seq: number;
	value: number;
};

/**
 * Autumn's side of `tracks.append`, in process: 204 once it holds the batch, and a command applies once per idempotency
 * key. Switches take it down, lose an ack after it took the batch, or refuse the Atom as Autumn would a bad request.
 */
export const startFakeAutumn = () => {
	const appliedKeys = new Set<string>();
	const applied: AppliedTrack[] = [];
	const requestSizes: number[] = [];
	const switches = {
		down: false,
		loseNextAck: false,
		refuseWith: null as 400 | 401 | null,
		/** A batch holding any of these commands is refused whole, as Autumn refuses a body with one bad track. */
		refuseCommandIds: new Set<string>(),
	};

	const appendTracks = async (request: Request): Promise<Response> => {
		if (switches.down)
			return Response.json({ code: "queue_unavailable" }, { status: 503 });
		if (switches.refuseWith === 401)
			return Response.json({ code: "atom_unknown" }, { status: 401 });
		const parsed = AtomTracksAppendRequestSchema.safeParse(
			await request.json(),
		);
		if (!parsed.success || switches.refuseWith === 400)
			return Response.json({ code: "unreadable" }, { status: 400 });
		const handedIn = parsed.data.tracks.flatMap((entry) =>
			"command" in entry ? [entry] : [],
		);
		const commands = handedIn.map(({ command }) =>
			parseTrackCommand({ input: command }),
		);
		if (
			commands.some(({ commandId }) => switches.refuseCommandIds.has(commandId))
		)
			return Response.json({ code: "unreadable" }, { status: 400 });
		requestSizes.push(parsed.data.tracks.length);
		for (const [index, { writerId, seq }] of handedIn.entries()) {
			const command = commands[index] as (typeof commands)[number];
			const key = command.idempotency?.key ?? command.commandId;
			if (appliedKeys.has(key)) continue;
			appliedKeys.add(key);
			applied.push({
				writer: writerId,
				customerId: command.identity.customerId,
				seq,
				value: command.value,
			});
		}
		if (switches.loseNextAck) {
			switches.loseNextAck = false;
			return Response.json({ code: "gateway_timeout" }, { status: 504 });
		}
		return new Response(null, { status: 204 });
	};

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: (request) => {
			if (new URL(request.url).pathname !== ATOM_TRACKS_APPEND_PATH)
				return new Response("no such route", { status: 404 });
			if (request.headers.get(ATOM_TOKEN_HASH_HEADER) !== "hash_folder")
				return Response.json({ code: "atom_unknown" }, { status: 401 });
			return appendTracks(request);
		},
	});

	return {
		url: `http://127.0.0.1:${server.port}`,
		applied,
		requestSizes,
		switches,
		/** Forgets every track it took, and comes back up. */
		reset: () => {
			appliedKeys.clear();
			applied.splice(0);
			requestSizes.splice(0);
			Object.assign(switches, {
				down: false,
				loseNextAck: false,
				refuseWith: null,
				refuseCommandIds: new Set<string>(),
			});
		},
		stop: () => server.stop(true),
	};
};

export type FakeAutumn = ReturnType<typeof startFakeAutumn>;

/** Polls until `holds`, so a test can wait on the forwarder's background drain. */
export const until = async (holds: () => boolean): Promise<void> => {
	for (let tries = 0; tries < 1000 && !holds(); tries++) await Bun.sleep(2);
	if (!holds()) throw new Error("Timed out waiting for a condition");
};
