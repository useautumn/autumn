import { readTriggerCliAuth } from "./cliAuth.ts";
import { readTriggerProjectRef } from "./projectRef.ts";

export async function archiveTriggerDevBranch({
	projectRoot,
	branch,
}: {
	projectRoot: string;
	branch: string;
}): Promise<{ ok: boolean; detail: string }> {
	if (!branch || branch === "default") {
		return { ok: true, detail: "skipped default branch" };
	}

	try {
		const { accessToken, apiUrl } = readTriggerCliAuth();
		const projectRef = readTriggerProjectRef({ projectRoot });
		const res = await fetch(
			`${apiUrl}/api/v1/projects/${projectRef}/branches/archive`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ env: "development", branch }),
			},
		);
		const body = await res.text();
		if (!res.ok) {
			// Already archived / missing — treat as success so races are fine.
			if (res.status === 404 || /not found|already archived/i.test(body)) {
				return { ok: true, detail: `already gone (${res.status})` };
			}
			return { ok: false, detail: `${res.status} ${body.slice(0, 200)}` };
		}
		return { ok: true, detail: "archived" };
	} catch (error) {
		return {
			ok: false,
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}
