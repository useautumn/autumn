import { describe, expect, it } from "bun:test";
import { createSubjectResidency } from "../../../../../src/internal/subjects/residency/createSubjectResidency.js";
import type { SubjectImport } from "../../../../../src/internal/subjects/types/subjectImport.js";

const importOf = (key: string): SubjectImport => ({
	key,
	customers: [],
	customerProducts: [],
	customerEntitlements: [],
	entitlements: [],
	features: [],
	products: [],
});

describe("createSubjectResidency", () => {
	it("runs one load per key no matter how many commands ask", async () => {
		const residency = createSubjectResidency();
		let loads = 0;
		const load = () => {
			loads++;
			return Promise.resolve(importOf("org:sandbox:cus_1"));
		};

		await Promise.all([
			residency.loadOnce({ key: "org:sandbox:cus_1", load }),
			residency.loadOnce({ key: "org:sandbox:cus_1", load }),
		]);
		await residency.loadOnce({ key: "org:sandbox:cus_1", load });

		expect(loads).toBe(1);
		expect(residency.takeLoaded().map((imported) => imported.key)).toEqual([
			"org:sandbox:cus_1",
		]);
		expect(residency.takeLoaded()).toEqual([]);
	});

	it("stays unresident until the rows are admitted, then retries nothing", () => {
		const residency = createSubjectResidency();

		expect(residency.isResident({ key: "k" })).toBe(false);
		residency.markResident({ key: "k" });
		expect(residency.isResident({ key: "k" })).toBe(true);
	});

	it("lets a failed load be retried", async () => {
		const residency = createSubjectResidency();
		let attempts = 0;
		const load = () => {
			attempts++;
			return attempts === 1
				? Promise.reject(new Error("postgres down"))
				: Promise.resolve(importOf("k"));
		};

		await expect(residency.loadOnce({ key: "k", load })).rejects.toThrow(
			"postgres down",
		);
		await residency.loadOnce({ key: "k", load });

		expect(attempts).toBe(2);
	});
});
