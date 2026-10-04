import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) =>
	readFileSync(
		new URL(`../../../../server/src/${path}`, import.meta.url),
		"utf8",
	);

test("only the staging primary pins fork count and every initial/recycled worker inherits it", () => {
	const boot = source("utils/memory/forkRecycling/serverForkVariant.ts");
	const init = source("init.ts");
	const recycle = source("utils/memory/forkRecycling/attachForkRecycling.ts");
	expect(boot).toContain('allowedArms: ["A", "B"]');
	expect(boot).toMatch(
		/if \(!stagingVariantsEnabled\([\s\S]*?return getServerForkCount\(\);/,
	);
	expect(boot).toContain(
		'if (arm === "B") process.env.SERVER_FORK_COUNT = "6";',
	);
	expect(boot).toMatch(
		/process\.env\.SERVER_FORK_VARIANT_ARM = arm;\s*return getServerForkCount\(\);/,
	);
	expect(boot).not.toContain('const forks = arm === "B" ? 6 : 4;');
	expect(boot.indexOf("return getServerForkCount();")).toBeLessThan(
		boot.indexOf("process.env.SERVER_FORK_COUNT ="),
	);
	expect(boot).toContain("process.env.SERVER_FORK_VARIANT_ARM = arm;");
	expect(init).toMatch(
		/if \(cluster.isPrimary\)[\s\S]*?await pinServerForkVariantAtBoot\(\);[\s\S]*?cluster.fork\(\)/,
	);
	expect(recycle).toContain("clusterModule.fork()");
	expect(boot).not.toMatch(/writeToSource|PutObject|updateSecret/);
});

test("server telemetry reports the captured arm/count and CPU without fake loop utilisation", () => {
	const monitor = source("utils/memory/serverEventLoopMonitor.ts");
	expect(monitor).toContain("summarizeProcessCpuWindow(");
	expect(monitor).toContain("const forkArm = getServerForkBootArm();");
	expect(monitor).toContain("const forkCount = getServerForkCount();");
	expect(monitor).toContain("[SERVER_FORK_EXPERIMENT]: forkArm");
	expect(monitor).toContain("forkCount,");
	expect(monitor).not.toContain("eventLoopUtilization");
});
