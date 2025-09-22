import { initUpstash } from "./upstashUtils.js";

export const addSubIdToCache = async ({
	subId,
	scenario,
}: {
	subId: string;
	scenario: string;
}) => {
	const upstash = await initUpstash();
	if (!upstash) return;

	await upstash.set(`sub:${subId}`, scenario, {
		ex: 180, // 3 minutes
	});
};
export const getSubScenarioFromCache = async ({ subId }: { subId: string }) => {
	const upstash = await initUpstash();
	if (!upstash) return null;
	return (await upstash.get(`sub:${subId}`)) as string | null;
};
