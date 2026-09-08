import { handoffBalanceObservation } from "@/internal/balances/shadow/handoffBalanceObservation.js";
import { prepareBalanceObservation } from "@/internal/balances/shadow/prepareBalanceObservation.js";
import type { LuaDeductionResult } from "@/internal/balances/utils/types/redisDeductionResult.js";
import { createCaptureFixture } from "../../unit/balances/shadow/utils/captureFixture.js";

const fixture = createCaptureFixture();
let delivered = 0;
fixture.capture.tryEnqueue = () => {
	delivered++;
	return true;
};
const input = {
	ctx: { ...fixture.ctx, balanceObservationCapture: fixture.capture },
	fullSubject: fixture.fullSubject,
	deduction: { feature: fixture.feature, deduction: 5 },
	options: {},
	customerEntitlements: [
		{
			...fixture.customerEntitlement,
			customer_product: fixture.customerProduct,
		},
	],
};
const result = { observation: fixture.observation } as LuaDeductionResult;
const off = { ...input, ctx: fixture.ctx };
const unselected = {
	...input,
	ctx: {
		...input.ctx,
		balanceObservationCapture: { ...fixture.capture, select: () => undefined },
	},
};
const cases = [
	{ name: "off", run: () => prepareBalanceObservation(off) },
	{ name: "not_enrolled", run: () => prepareBalanceObservation(unselected) },
	{ name: "capture_policy", run: () => prepareBalanceObservation(input) },
	{
		name: "validate_and_handoff",
		run: () => handoffBalanceObservation({ ...fixture, result }),
	},
];
for (let repetition = 0; repetition < 3; repetition++) {
	for (const benchmark of cases) {
		for (let index = 0; index < 5_000; index++) benchmark.run();
		const samples = 100_000;
		const start = performance.now();
		for (let index = 0; index < samples; index++) benchmark.run();
		console.log(
			JSON.stringify({
				name: benchmark.name,
				samples,
				repetition,
				meanMicros: ((performance.now() - start) * 1000) / samples,
			}),
		);
	}
}
if (delivered !== 315_000)
	throw new Error("Benchmark did not deliver all observations");
