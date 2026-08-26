import type { CheckResponseV3 } from "@autumn/shared";

export type RunCheckResult<TCheckData> =
	| {
			checkData: TCheckData;
			response: CheckResponseV3;
	  }
	| {
			checkData: null;
			response: Record<string, unknown>;
			/** True when the metering worker answered. Distinguishes a real answer
			 *  reached without loading check data from a degraded fail-open one,
			 *  which is the difference between a 200 and a 202 to the caller. */
			routed?: boolean;
	  };
