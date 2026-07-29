import { expect, test } from "bun:test";
import { reconcileActiveSandbox } from "@/hooks/sandbox/reconcileActiveSandbox";

const sandbox = (id: string) => ({ id, name: id });
const summary = (id: string, name: string, color?: string, icon?: string) => ({
	id,
	name,
	color,
	icon,
});

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
			sandboxes: [summary("sb_1", "sb_1"), summary("sb_2", "sb_2")],
			listLoaded: true,
		}),
	).toEqual({ id: "sb_1", name: "sb_1", color: undefined, icon: undefined });
});

test("loaded matching sandbox replaces the persisted active with the latest name/color/icon", () => {
	const active = summary("sb_1", "Old Name", "gray", "flask");
	expect(
		reconcileActiveSandbox({
			activeSandbox: active,
			sandboxes: [summary("sb_1", "New Name", "blue", "rocket")],
			listLoaded: true,
		}),
	).toEqual({
		id: "sb_1",
		name: "New Name",
		color: "blue",
		icon: "rocket",
	});
});

test("returns the same reference when content is unchanged (avoids an update loop)", () => {
	const active = summary("sb_1", "Staging", "blue", "rocket");
	expect(
		reconcileActiveSandbox({
			activeSandbox: active,
			sandboxes: [summary("sb_1", "Staging", "blue", "rocket")],
			listLoaded: true,
		}),
	).toBe(active);
});

test("drops the selection once loaded and genuinely absent", () => {
	expect(
		reconcileActiveSandbox({
			activeSandbox: sandbox("sb_deleted"),
			sandboxes: [summary("sb_other", "sb_other")],
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
	const list = [summary("sb_staging", "sb_staging", "blue", "rocket")];
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
	expect(loaded).toEqual({
		id: "sb_staging",
		name: "sb_staging",
		color: "blue",
		icon: "rocket",
	});
});
