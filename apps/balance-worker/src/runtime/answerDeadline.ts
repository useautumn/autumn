import { AsyncLocalStorage } from "node:async_hooks";

const answerDeadlines = new AsyncLocalStorage<{ expiresAt: number }>();

export function runWithAnswerDeadline<Value>({
	expiresAt,
	run,
}: {
	expiresAt: number;
	run: () => Promise<Value>;
}): Promise<Value> {
	return answerDeadlines.run({ expiresAt }, run);
}

export function readAnswerDeadline(): number | undefined {
	return answerDeadlines.getStore()?.expiresAt;
}
