/**
 * Autumn as the replicas meet it on staging: it takes tracks.append, then pushes each customer's subject back after a
 * short lag to one replica of the two, the way herald does once the worker applies a track; a tenth of customers get no push, so their tracks are
 * left for the forwarder's settle pull, which it answers. `bun tests/bench/feedbackAutumn.ts <port> <atomToken> <replicas,...> <subjects.json>`.
 */

import type { SubjectState } from "@autumn/balance-engine";
import {
	ATOM_CUSTOMER_ID_HEADER,
	ATOM_SUBJECT_READ_PATH,
	ATOM_TRACKS_APPEND_PATH,
} from "@autumn/byoc";

const [portArg, atomToken, replicasArg, templatePath] = process.argv.slice(2);
/** How long after the hand-in herald's push lands. */
const PUSH_LAG_MS = 50;
/** Customers herald pushes nothing back for (a later push would settle their earlier tracks too): only the settle pull clears them. */
const isUnpushed = (customerId: string) =>
	Bun.hash.xxHash32(customerId) % 10 === 0;

type Template = { state: SubjectState; catalog: unknown; org: unknown };
const template: Template = await Bun.file(templatePath as string).json();
const replicas = (replicasArg as string).split(",");
const deducted = new Map<string, number>();
const seqs = new Map<string, Record<string, number>>();
let readAt = 2_000;
let logOffset = 10n;
const counts = { tracks: 0, pushes: 0, reads: 0 };

/** The customer's subject as the worker holds it now: its messages balance less every track taken, and how far it holds each journal. */
const subjectBodyOf = (customerId: string): string => {
	const state = structuredClone(template.state);
	state.identity.customerId = customerId;
	const [messages] = state.customerEntitlements;
	if (messages) messages.balance -= deducted.get(customerId) ?? 0;
	return JSON.stringify({
		state,
		catalog: template.catalog,
		org: template.org,
		log_offset: String(logOffset++),
		read_at: readAt++,
		atom_seqs: seqs.get(customerId) ?? null,
	});
};

const push = (customerId: string) => {
	const body = subjectBodyOf(customerId);
	counts.pushes++;
	// Herald pushes to the deployment's address, so one replica, either one, takes it and relays it to the other.
	const replica = replicas[Math.floor(Math.random() * replicas.length)];
	void fetch(`http://${replica}/v1/subjects.set`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": atomToken as string,
			[ATOM_CUSTOMER_ID_HEADER]: customerId,
		},
		body,
	})
		.then((reply) => reply.arrayBuffer())
		.catch(() => {});
};

Bun.serve({
	hostname: "127.0.0.1",
	port: Number(portArg),
	fetch: async (request) => {
		const { pathname } = new URL(request.url);
		if (pathname === "/__counts") return Response.json(counts);
		if (pathname === ATOM_SUBJECT_READ_PATH) {
			const { customer_id: customerId } = await request.json();
			counts.reads++;
			return new Response(subjectBodyOf(customerId), {
				headers: { "content-type": "application/json" },
			});
		}
		if (pathname !== ATOM_TRACKS_APPEND_PATH)
			return new Response("no such route", { status: 404 });
		const { writer, tracks } = await request.json();
		for (const track of tracks) {
			const customerId: string = track.command.identity.customerId;
			counts.tracks++;
			deducted.set(
				customerId,
				(deducted.get(customerId) ?? 0) + track.command.value,
			);
			const held = seqs.get(customerId) ?? {};
			const trackWriter: string = track.writer ?? writer;
			held[trackWriter] = Math.max(held[trackWriter] ?? 0, track.seq);
			seqs.set(customerId, held);
			if (!isUnpushed(customerId))
				setTimeout(() => push(customerId), PUSH_LAG_MS);
		}
		return new Response(null, { status: 204 });
	},
});
console.log("ready");
