import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";

export type SendLatencyHistogram = Record<string, number>;

export const measureApplyBillingPlanSends = async <Result>({
	run,
}: {
	run: () => Promise<Result>;
}): Promise<{ result: Result; sendLatencyMs: SendLatencyHistogram }> => {
	const client = getBalanceWorkerClient();
	const send = client.applyBillingPlan;
	const sendLatencyMs: SendLatencyHistogram = {};
	client.applyBillingPlan = async (params) => {
		const startedAt = performance.now();
		try {
			return await send(params);
		} finally {
			const bucket = String(Math.round(performance.now() - startedAt));
			sendLatencyMs[bucket] = (sendLatencyMs[bucket] ?? 0) + 1;
		}
	};
	try {
		return { result: await run(), sendLatencyMs };
	} finally {
		client.applyBillingPlan = send;
	}
};
