import type { TrackResponseV3 } from "@autumn/shared";
import { z } from "zod/v4";
import { trackResultToTrackResponse } from "../src/api/track/trackResultToTrackResponse.js";
import { TrackResultSchema } from "../src/api/track/types/trackResult.js";
import type { Command } from "../src/api/types/command.js";
import { CommandResultBatchSchema } from "../src/api/types/commandResult.js";
import { LedgerCommandError } from "./ledgerCommandError.js";
import type { LedgerClientContext } from "./types/ledgerClient.js";

const OK = 200;
const MULTIPLE_CHOICES = 300;
const BAD_GATEWAY = 502;

const ErrorBodySchema = z.object({
	code: z.string().optional(),
	message: z.string().optional(),
});

const resultToCommandError = ({
	status,
	body,
}: {
	status: number;
	body: unknown;
}): LedgerCommandError => {
	const parsed = ErrorBodySchema.safeParse(body);
	return new LedgerCommandError({
		status,
		code: parsed.success ? parsed.data.code : undefined,
		message:
			(parsed.success ? parsed.data.message : undefined) ??
			"ledger: command failed",
	});
};

export const trackCommand = async ({
	ctx,
	command,
}: {
	ctx: LedgerClientContext;
	command: Command;
}): Promise<TrackResponseV3> => {
	const response = await fetch(new URL("/commands", ctx.baseUrl), {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify([command]),
		signal: AbortSignal.timeout(ctx.timeoutMs),
	});

	const [result] = CommandResultBatchSchema.parse(await response.json());
	if (!result) {
		throw new LedgerCommandError({
			status: BAD_GATEWAY,
			message: "ledger: empty command result batch",
		});
	}
	if (result.status < OK || result.status >= MULTIPLE_CHOICES) {
		throw resultToCommandError({ status: result.status, body: result.body });
	}

	return trackResultToTrackResponse({
		result: TrackResultSchema.parse(result.body),
	});
};
