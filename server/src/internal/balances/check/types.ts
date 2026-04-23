import type { CheckResponseV3 } from "@autumn/shared";

export type RunCheckResult<TCheckData> =
	| {
			checkData: TCheckData;
			response: CheckResponseV3;
	  }
	| {
			checkData: null;
			response: Record<string, unknown>;
	  };
