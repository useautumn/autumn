import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { replicaUrl } from "./replicaProcesses.js";
import type {
	PushLanding,
	Replica,
	ReplicaSetContext,
} from "./types/replicaSet.js";

const PUSH_PATHS = new Set(["/v1/subjects.set", "/v1/catalog.set"]);

type BalancerState = {
	routedTo: number | null;
	turn: number;
	pushes: PushLanding[];
};

/** The pinned replica, else the next running one; a stopped target is left to fail, as a balancer's would. */
const pickReplica = ({
	ctx,
	state,
}: {
	ctx: ReplicaSetContext;
	state: BalancerState;
}): Replica | null => {
	if (state.routedTo !== null) return ctx.replicas[state.routedTo] ?? null;
	const running = ctx.replicas.filter((replica) => replica.process !== null);
	if (running.length === 0) return null;
	state.turn += 1;
	return running[state.turn % running.length];
};

/** A balancer's 502, in JSON like every other reply a client reads. */
const unreachable = ({ message }: { message: string }): Response =>
	Response.json({ message, code: "replica_unreachable" }, { status: 502 });

const forwardToReplica = async ({
	request,
	replica,
}: {
	request: Request;
	replica: Replica;
}): Promise<Response> => {
	const { pathname, search } = new URL(request.url);
	const headers = new Headers(request.headers);
	headers.delete("host");
	try {
		const response = await fetch(
			`${replicaUrl({ replica })}${pathname}${search}`,
			{
				method: request.method,
				headers,
				body:
					request.method === "GET" ? undefined : await request.arrayBuffer(),
			},
		);
		// fetch already decoded the body, so its encoding and length no longer describe it.
		const replyHeaders = new Headers(response.headers);
		replyHeaders.delete("content-encoding");
		replyHeaders.delete("content-length");
		return new Response(await response.arrayBuffer(), {
			status: response.status,
			headers: replyHeaders,
		});
	} catch {
		return unreachable({ message: "The replica could not be reached" });
	}
};

const recordPush = ({
	state,
	request,
	replica,
	status,
}: {
	state: BalancerState;
	request: Request;
	replica: Replica;
	status: number;
}): void => {
	const { pathname } = new URL(request.url);
	if (!PUSH_PATHS.has(pathname)) return;
	state.pushes.push({
		path: pathname,
		customerId: request.headers.get(ATOM_CUSTOMER_ID_HEADER),
		replica: replica.index,
		status,
		at: Date.now(),
	});
};

/** The one endpoint Autumn knows the set by, as the load balancer in front of a deployment's replicas. */
export const createReplicaBalancer = ({ ctx }: { ctx: ReplicaSetContext }) => {
	const state: BalancerState = { routedTo: null, turn: 0, pushes: [] };

	async function receive(request: Request): Promise<Response> {
		const replica = pickReplica({ ctx, state });
		if (!replica) return unreachable({ message: "No replica is running" });
		const response = await forwardToReplica({ request, replica });
		recordPush({ state, request, replica, status: response.status });
		return response;
	}

	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });

	return {
		url: `http://127.0.0.1:${server.port}`,
		routeTo: (index: number | null) => {
			state.routedTo = index;
		},
		pushes: () => [...state.pushes],
		stop: () => server.stop(true),
	};
};
