import { expect, test } from "bun:test";
import { reconcileActiveSandbox } from "@/hooks/sandbox/reconcileActiveSandbox";

const sandbox = (id: string) => ({ id, name: id });

// A disabled or in-flight sandboxes query reports an empty list. Dropping the
// selection then wipes the sandbox useActiveSandbox just restored from
// localStorage on a cold reload, before the authoritative list can arrive.
test("keeps the restored selection while the list has not loaded", () => {
	const active = sandbox("sb_restored");
	expect(
		reconcileActiveSandbox({
			activeSandbox: active,
			sandboxes: [],
			listLoaded: false,
		}),
	).toBe(active);
});

test("keeps the selection once loaded and still present", () => {
	const active = sandbox("sb_1");
	expect(
		reconcileActiveSandbox({
			activeSandbox: active,
			sandboxes: [sandbox("sb_1"), sandbox("sb_2")],
			listLoaded: true,
		}),
	).toBe(active);
});

test("drops the selection once loaded and genuinely absent", () => {
	expect(
		reconcileActiveSandbox({
			activeSandbox: sandbox("sb_deleted"),
			sandboxes: [sandbox("sb_other")],
			listLoaded: true,
		}),
	).toBeNull();
});

test("is a no-op when there is no active sandbox", () => {
	expect(
		reconcileActiveSandbox({
			activeSandbox: null,
			sandboxes: [],
			listLoaded: true,
		}),
	).toBeNull();
});

// The exact state sequence a hard reload drives the sandboxes query through:
// disabled (canSwitch false) -> in-flight -> loaded. The restore must survive.
test("cold reload survives disabled then in-flight then loaded-present", () => {
	const active = sandbox("sb_staging");
	const list = [sandbox("sb_staging")];
	const disabled = reconcileActiveSandbox({
		activeSandbox: active,
		sandboxes: [],
		listLoaded: false,
	});
	const inFlight = reconcileActiveSandbox({
		activeSandbox: disabled,
		sandboxes: [],
		listLoaded: false,
	});
	const loaded = reconcileActiveSandbox({
		activeSandbox: inFlight,
		sandboxes: list,
		listLoaded: true,
	});
	expect(loaded).toBe(active);
});
