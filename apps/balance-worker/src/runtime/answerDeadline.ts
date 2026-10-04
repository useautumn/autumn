import { AsyncLocalStorage } from "node:async_hooks";

type AnswerDeadline = {
	expiresAt: number;
	/** When the caller's own budget ran out, counted from when the worker took the request. */
	abandonedAt?: number;
};

const answerDeadlines = new AsyncLocalStorage<AnswerDeadline>();

export function runWithAnswerDeadline<Value>({
	expiresAt,
	abandonedAt,
	run,
}: {
	expiresAt: number;
	abandonedAt?: number;
	run: () => Promise<Value>;
}): Promise<Value> {
	return answerDeadlines.run(
		abandonedAt === undefined ? { expiresAt } : { expiresAt, abandonedAt },
		run,
	);
}

export function readAnswerDeadline(): number | undefined {
	return answerDeadlines.getStore()?.expiresAt;
}

export function readAbandonedAt(): number | undefined {
	return answerDeadlines.getStore()?.abandonedAt;
}
