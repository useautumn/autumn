/**
 * Autumn as one hot customer's worker meets it: each handed-in track is applied with the engine, stamped with its source
 * as the server stamps it, and the subject read then lands on the Atom after the push lag, carrying how far it held each journal.
 * Run as a script: `bun tests/bench/workerAutumn.ts <port> <atomPushUrl> <pushLagMs> <subject.json>`.
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

export const WORKER_AUTUMN_PATH = import.meta.path;
const ATOM_ID = "atom_bench";

if (import.meta.main) await serveWorkerAutumn();

async function serveWorkerAutumn(): Promise<void> {
	const [portArg, atomPushUrl, pushLagArg, subjectPath] = process.argv.slice(2);
	type Subject = { state: SubjectState; catalog: Catalog; org: unknown };
	const subject: Subject = await Bun.file(subjectPath as string).json();
	let state = subject.state;
	let logOffset = 10n;
	let readAt = 2_000;

	const applyTrack = ({
		command,
		writerId,
		seq,
	}: {
		command: TrackCommand;
		writerId: string;
		seq: number;
	}) => {
		state = applyMutation({
			state,
			mutation: computeTrack({
				fullSubject: subjectStateToFullSubject({
					state,
					catalog: subject.catalog,
				}),
				command: { ...command, source: { atomId: ATOM_ID, writerId, seq } },
			}),
		});
	};

	/** The subject as herald reads it right after the apply; it reaches the Atom `pushLagMs` later. */
	const readBody = () =>
		JSON.stringify({
			state,
			catalog: subject.catalog,
			org: subject.org,
			log_offset: String(logOffset++),
			read_at: readAt++,
			atom_seqs: state.customer.atom_seqs?.[ATOM_ID] ?? null,
		});

	const push = ({ body }: { body: string }) => {
		void fetch(atomPushUrl as string, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[ATOM_CUSTOMER_ID_HEADER]: state.identity.customerId,
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
			for (const track of tracks)
				applyTrack({
					command: track.command,
					writerId: track.writer ?? writer,
					seq: track.seq,
				});
			const body = readBody();
			setTimeout(() => push({ body }), Number(pushLagArg));
			return new Response(null, { status: 204 });
		},
	});
	console.log("ready");
}
