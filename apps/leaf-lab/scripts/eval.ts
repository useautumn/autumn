import { resolve } from "node:path";

const target = process.argv[2] ?? "agent/mcp/attach-approval.eval.ts";
if (!/^[a-zA-Z0-9_\-/]+\.eval\.ts$/.test(target) || target.includes("..")) {
	throw new Error("Expected a Leaf eval path relative to tests/evals");
}
process.env.LEAF_EVAL_DRIVER = "eve-lab";
process.env.EVAL_FAIL_ON_SCORE = "1";
process.env.LEAF_LAB_MODE ??= "jev";
if (process.env.LEAF_LAB_MODE === "jev" && !process.env.TYPESAFE_API_KEY) {
	throw new Error("TYPESAFE_API_KEY is required for the Jev arm");
}
await import(resolve(import.meta.dirname, "../../leaf/tests/evals", target));
