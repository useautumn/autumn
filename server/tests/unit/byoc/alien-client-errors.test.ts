import { afterAll, expect, spyOn, test } from "bun:test";
import { AlienRequestError } from "@autumn/alien";
import { ErrCode, RecaseError } from "@autumn/shared";
import { alienErrorToByocUnavailable } from "@/external/alien/alienErrorToByocUnavailable.js";
import { logger } from "@/external/logtail/logtailUtils.js";

const warn = spyOn(logger, "warn").mockImplementation(() => {});

afterAll(() => warn.mockRestore());

test("a refused alien call becomes a 503, with alien's status and reason logged", () => {
	const refused = new AlienRequestError({
		path: "/v1/deployments/dep_1/delete?workspace=autumn",
		status: 403,
		detail: '{"code":"FORBIDDEN","message":"Cannot delete deployment"}',
	});

	const error = alienErrorToByocUnavailable({ error: refused });

	expect(error).toBeInstanceOf(RecaseError);
	expect(error).toMatchObject({
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data: { status: 403 },
		cause: refused,
	});
	expect(warn).toHaveBeenCalledWith(
		"alien request failed: 403 on /v1/deployments/dep_1/delete?workspace=autumn",
		{
			path: refused.path,
			status: 403,
			detail: refused.detail,
		},
	);
});

test("any other error passes through untouched and unlogged", () => {
	warn.mockClear();
	const other = new Error("boom");

	expect(alienErrorToByocUnavailable({ error: other })).toBe(other);
	expect(warn).not.toHaveBeenCalled();
});
