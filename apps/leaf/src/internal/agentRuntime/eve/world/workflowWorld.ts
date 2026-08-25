import { createWorld } from "@workflow/world-postgres";

export type WorkflowWorld = ReturnType<typeof createWorld>;

const worldConnectionString = () =>
	process.env.WORKFLOW_POSTGRES_URL ?? process.env.CHAT_DATABASE_URL;

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

export const requireWorkflowWorld = (): WorkflowWorld => {
	const current = workflowWorld();
	if (!current) throw new Error("No workflow world is configured");
	return current;
};

export const isWorldNotFoundError = (error: unknown) =>
	error instanceof Error &&
	/not found|404|does not exist/i.test(`${error.name} ${error.message}`);
