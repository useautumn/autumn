/**
 * workerAutumn.ts for many customers. Each handed-in track is applied with the engine
 * to its own customer's state, and each customer a batch touched is pushed after the lag, carrying its atom_seqs.
 * `bun multiWorkerAutumn.ts <port> <pushUrl> <pushLagMs> <hotSubject.json> <hotCustomerId> <backgroundSubject.json>`.
 */
import {
	applyMutation,
	type Catalog,
	computeTrack,
	type SubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import { ATOM_CUSTOMER_ID_HEADER, ATOM_TRACKS_APPEND_PATH } from "@autumn/byoc";

const ATOM_ID = "atom_bench";
const [portArg, pushUrl, pushLagArg, hotPath, hotCustomerId, backgroundPath] =
	process.argv.slice(2);
type Subject = { state: SubjectState; catalog: Catalog; org: unknown };
const hot: Subject = await Bun.file(hotPath as string).json();
const background: Subject = await Bun.file(backgroundPath as string).json();
const templateOf = (customerId: string) =>
	customerId === hotCustomerId ? hot : background;
const states = new Map<string, SubjectState>();
let logOffset = 10n;
let readAt = 2_000;

const stateOf = (customerId: string): SubjectState => {
	const held = states.get(customerId);
	if (held) return held;
	const template = templateOf(customerId).state;
	return { ...template, identity: { ...template.identity, customerId } };
};

const applyTrack = ({
	command,
	writerId,
	seq,
}: {
	command: TrackCommand;
	writerId: string;
	seq: number;
}) => {
	const customerId = command.identity.customerId;
	const state = stateOf(customerId);
	states.set(
		customerId,
		applyMutation({
			state,
			mutation: computeTrack({
				fullSubject: subjectStateToFullSubject({
					state,
					catalog: templateOf(customerId).catalog,
				}),
				command: { ...command, source: { atomId: ATOM_ID, writerId, seq } },
			}),
		}),
	);
};

const bodyOf = (customerId: string) => {
	const state = stateOf(customerId);
	return JSON.stringify({
		state,
		catalog: templateOf(customerId).catalog,
		org: templateOf(customerId).org,
		log_offset: String(logOffset++),
		read_at: readAt++,
		atom_seqs: state.customer.atom_seqs?.[ATOM_ID] ?? null,
	});
};

const push = ({ customerId, body }: { customerId: string; body: string }) => {
	void fetch(pushUrl as string, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[ATOM_CUSTOMER_ID_HEADER]: customerId,
		},
		body,
	}).catch(() => {});
};

Bun.serve({
	hostname: "127.0.0.1",
	port: Number(portArg),
	fetch: async (request) => {
		if (new URL(request.url).pathname !== ATOM_TRACKS_APPEND_PATH)
			return new Response("no such route", { status: 404 });
		const { writer, tracks } = await request.json();
		const touched = new Set<string>();
		for (const track of tracks) {
			applyTrack({
				command: track.command,
				writerId: track.writerId ?? track.writer ?? writer,
				seq: track.seq,
			});
			touched.add(track.command.identity.customerId);
		}
		for (const customerId of touched) {
			const body = bodyOf(customerId);
			setTimeout(() => push({ customerId, body }), Number(pushLagArg));
		}
		return new Response(null, { status: 204 });
	},
});
console.log("ready");
