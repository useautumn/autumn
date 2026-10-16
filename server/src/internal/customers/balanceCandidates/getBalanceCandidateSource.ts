import { logger } from "@/external/logtail/logtailUtils.js";
import { createMotherDuckBalanceCandidateSource } from "@/external/motherduck/balanceCandidates/createMotherDuckBalanceCandidateSource.js";
import { isMotherDuckConfigured } from "@/external/motherduck/initMotherDuck.js";
import { createPostgresBalanceCandidateSource } from "./postgres/createPostgresBalanceCandidateSource.js";
import type {
	BalanceCandidateBackend,
	BalanceCandidateSource,
} from "./types/balanceCandidateSource.js";

/** Production always gets MotherDuck (even without a token: unavailable, never
 * Postgres); a configured token also keeps prod-secret local runs off Postgres. */
export const balanceCandidateBackendFor = ({
	nodeEnv,
	motherDuckConfigured,
}: {
	nodeEnv: string | undefined;
	motherDuckConfigured: boolean;
}): BalanceCandidateBackend =>
	nodeEnv === "production" || motherDuckConfigured ? "motherduck" : "postgres";

let balanceCandidateSource: BalanceCandidateSource | undefined;

export const getBalanceCandidateSource = (): BalanceCandidateSource => {
	balanceCandidateSource ??= createBalanceCandidateSource();
	return balanceCandidateSource;
};

const createBalanceCandidateSource = (): BalanceCandidateSource => {
	const backend = balanceCandidateBackendFor({
		nodeEnv: process.env.NODE_ENV,
		motherDuckConfigured: isMotherDuckConfigured(),
	});
	logger.info(`[balanceCandidates] backend=${backend}`);
	return backend === "motherduck"
		? createMotherDuckBalanceCandidateSource()
		: createPostgresBalanceCandidateSource();
};
