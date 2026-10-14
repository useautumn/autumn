import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";
import { SubjectCatalogEvictedError } from "../subject/subjectErrors.js";

const MAX_ATTEMPTS = 2;

export function isGoneMidRequest(cause: unknown): boolean {
	return (
		cause instanceof PartitionProcessorStateNotFoundError ||
		cause instanceof SubjectCatalogEvictedError
	);
}

export async function withResidentSubject<Result>({
	ensure,
	attempt,
	customerKey,
	onRetry,
}: {
	ensure(): Promise<void>;
	attempt(): Promise<Result | null> | Result | null;
	customerKey: string;
	onRetry?(params: { attempt: number }): void;
}): Promise<Result> {
	for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber++) {
		let result: Result | null;
		try {
			await ensure();
			result = await attempt();
		} catch (cause) {
			if (!isGoneMidRequest(cause)) throw cause;
			if (attemptNumber === MAX_ATTEMPTS) throw cause;
			result = null;
		}
		if (result !== null) return result;
		if (attemptNumber < MAX_ATTEMPTS) onRetry?.({ attempt: attemptNumber });
	}
	throw new PartitionProcessorStateNotFoundError({ customerKey });
}
