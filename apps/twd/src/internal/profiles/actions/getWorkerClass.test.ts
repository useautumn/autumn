import { afterEach, expect, test } from "bun:test";
import { getWorkerClass } from "./getWorkerClass.ts";

const saved = process.env.TW_MODAL_REGION;
afterEach(() => {
	if (saved === undefined) delete process.env.TW_MODAL_REGION;
	else process.env.TW_MODAL_REGION = saved;
});

test("unpinned and pinned placements get separate profile keys", () => {
	delete process.env.TW_MODAL_REGION;
	expect(getWorkerClass()).toEndWith("-unpinned");
	process.env.TW_MODAL_REGION = " ";
	expect(getWorkerClass()).toEndWith("-unpinned");
	process.env.TW_MODAL_REGION = "us-east-1";
	expect(getWorkerClass()).toEndWith("-us-east-1");
	process.env.TW_MODAL_REGION = "us, eu";
	expect(getWorkerClass()).toEndWith("-us+eu");
});
