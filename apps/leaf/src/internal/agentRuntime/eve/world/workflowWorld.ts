import { createWorld } from "@workflow/world-postgres";

export type WorkflowWorld = ReturnType<typeof createWorld>;

const worldConnectionString = () => process.env.CHAT_DATABASE_URL;

let world: WorkflowWorld | undefined;

export const hasWorkflowWorld = () => Boolean(worldConnectionString());

/** Read-only handle on eve's durable journal; never `start()`ed. */
export const workflowWorld = (): WorkflowWorld | undefined => {
	const connectionString = worldConnectionString();
	if (!connectionString) return undefined;
	world ??= createWorld({
		connectionString,
		namespace: process.env.WORKFLOW_QUEUE_NAMESPACE,
	});
	return world;
};

const runPresence = new Map<string, Promise<boolean>>();

const worldHoldsRun = ({
	sessionId,
	world,
}: {
	sessionId: string;
	world: WorkflowWorld;
}) => {
	let presence = runPresence.get(sessionId);
	if (!presence) {
		presence = world.runs
			.get(sessionId, { resolveData: "none" })
			.then(() => true)
			.catch((error: unknown) => {
				if (isWorldNotFoundError(error)) return false;
				runPresence.delete(sessionId);
				throw error;
			});
		runPresence.set(sessionId, presence);
	}
	return presence;
};

/** The world only for a run it actually holds: eve may be journaling to a
 * different world than leaf is configured to read (local files vs Postgres),
 * and reading the wrong one tails an empty stream forever. */
export const workflowWorldHoldingRun = async (
	sessionId: string,
): Promise<WorkflowWorld | undefined> => {
	const world = workflowWorld();
	if (!world) return undefined;
	return (await worldHoldsRun({ sessionId, world })) ? world : undefined;
};

export const requireWorkflowWorld = (): WorkflowWorld => {
	const current = workflowWorld();
	if (!current) throw new Error("No workflow world is configured");
	return current;
};

export const isWorldNotFoundError = (error: unknown) =>
	error instanceof Error &&
	/not found|404|does not exist/i.test(`${error.name} ${error.message}`);
