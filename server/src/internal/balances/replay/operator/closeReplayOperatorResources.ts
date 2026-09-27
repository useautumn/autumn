import {
	buildReplayOperatorCloseFailure,
	ReplayOperatorCleanupError,
	type ReplayOperatorCloseFailure,
} from "./replayOperatorErrors.js";

export type ReplayOperatorClosePort = () => void | Promise<void>;

/** Every port is optional: a startup that failed half way owns the cleanup of
 *  whatever it already created and nothing else. */
export type ReplayOperatorClosePorts = {
	closeCoordinator?: ReplayOperatorClosePort;
	stopOwners?: ReplayOperatorClosePort;
	closeSource?: ReplayOperatorClosePort;
	endPool?: ReplayOperatorClosePort;
};

async function closePort({
	port,
	close,
	failures,
}: {
	port: string;
	close: ReplayOperatorClosePort | undefined;
	failures: ReplayOperatorCloseFailure[];
}): Promise<void> {
	if (!close) return;
	try {
		await close();
	} catch (error) {
		failures.push(buildReplayOperatorCloseFailure({ port, error }));
	}
}

/** The coordinator drains its in-flight physical jobs first, so the source and
 *  the pool are still usable while they finish. Ownership is stopped on every
 *  path, including one where an earlier close already failed. */
export async function closeReplayOperatorResources({
	ports,
}: {
	ports: ReplayOperatorClosePorts;
}): Promise<void> {
	const failures: ReplayOperatorCloseFailure[] = [];
	await closePort({
		port: "coordinator",
		close: ports.closeCoordinator,
		failures,
	});
	await closePort({ port: "owners", close: ports.stopOwners, failures });
	await closePort({ port: "source", close: ports.closeSource, failures });
	await closePort({ port: "database", close: ports.endPool, failures });
	if (failures.length > 0) throw new ReplayOperatorCleanupError({ failures });
}
