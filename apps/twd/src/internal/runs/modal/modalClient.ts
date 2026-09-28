import { ModalClient } from "modal";
import pLimit from "p-limit";

/** Same repo/tag scheme scripts/tw/helpers/modal.ts publishes warm images under. */
export const warmImageTag = ({ sha }: { sha: string }) =>
	`tw-warm:${sha.slice(0, 12)}`;

let client: ModalClient | undefined;
const getModal = () => {
	client ??= new ModalClient();
	return client;
};

export const warmImageExists = async ({ sha }: { sha: string }) =>
	getModal()
		.images.fromName(warmImageTag({ sha }))
		.then(() => true)
		.catch(() => false);

/** Best-effort terminate by Modal sandbox id (crash recovery of a swarm's leftovers). */
export const terminateSandboxes = async ({
	sandboxIds,
}: {
	sandboxIds: string[];
}) => {
	const limit = pLimit(16);
	await Promise.all(
		sandboxIds.map((sandboxId) =>
			limit(async () => {
				const sandbox = await getModal()
					.sandboxes.fromId(sandboxId)
					.catch(() => undefined);
				await sandbox?.terminate().catch(() => undefined);
			}),
		),
	);
};
