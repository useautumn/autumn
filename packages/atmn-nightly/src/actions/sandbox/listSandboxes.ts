import type { ListSandboxesResponse } from "../../generated/client";
import { renderSandboxes } from "../../render/renderSandboxes";
import type { SandboxClient, WriteLine } from "./types/sandboxClient";

export type SandboxListOptions = {
	client: SandboxClient;
	/** The sandbox `--sandbox` or AUTUMN_SANDBOX_ID points at; marked in the table. */
	currentSandboxId?: string;
	json?: boolean;
	write?: WriteLine;
};

export const runSandboxList = async ({
	client,
	currentSandboxId,
	json = false,
	write = (text) => process.stdout.write(text),
}: SandboxListOptions): Promise<ListSandboxesResponse> => {
	const response = await client.listSandboxes({});

	if (json) {
		write(`${JSON.stringify(response, null, 2)}\n`);
		return response;
	}

	write(`${renderSandboxes({ sandboxes: response.list, currentSandboxId })}\n`);
	return response;
};
