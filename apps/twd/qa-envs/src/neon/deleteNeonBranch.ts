import type { Env } from "../types";

/** Deletes the env's Neon branch; a branch Neon already expired counts as deleted. */
export async function deleteNeonBranch({
	env,
	branchId,
}: {
	env: Env;
	branchId: string;
}) {
	const res = await fetch(
		`https://console.neon.tech/api/v2/projects/${env.NEON_PROJECT_ID}/branches/${branchId}`,
		{
			method: "DELETE",
			headers: { authorization: `Bearer ${env.NEON_API_KEY}` },
		},
	);
	if (!res.ok && res.status !== 404)
		throw new Error(
			`neon delete ${branchId}: ${res.status} ${await res.text()}`,
		);
}
