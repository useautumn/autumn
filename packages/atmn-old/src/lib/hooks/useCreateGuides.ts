import fs from "node:fs/promises";
import path from "node:path";
import { useState } from "react";
import {
	autumnBillingPageContent,
	autumnGatingContent,
	autumnModellingPricingPlansContent,
	autumnSetupContent,
} from "../../prompts/skills/index.js";

const GUIDES_DIR = "autumn-guides";

type CreateGuidesState = "idle" | "creating" | "done" | "error";

export function useCreateGuides() {
	const [state, setState] = useState<CreateGuidesState>("idle");
	const [filesCreated, setFilesCreated] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const create = async (
		hasPricing: boolean,
		options?: { saveAll?: boolean },
	) => {
		setState("creating");
		try {
			const cwd = process.cwd();
			const guidesPath = path.join(cwd, GUIDES_DIR);
			await fs.mkdir(guidesPath, { recursive: true });

			const created: string[] = [];

			await fs.writeFile(
				path.join(guidesPath, "1_Setup.md"),
				autumnSetupContent,
				"utf-8",
			);
			created.push("1_Setup.md");

			await fs.writeFile(
				path.join(guidesPath, "2_Gating.md"),
				autumnGatingContent,
				"utf-8",
			);
			created.push("2_Gating.md");

			await fs.writeFile(
				path.join(guidesPath, "3_Billing_Page.md"),
				autumnBillingPageContent,
				"utf-8",
			);
			created.push("3_Billing_Page.md");

			if (options?.saveAll || !hasPricing) {
				await fs.writeFile(
					path.join(guidesPath, "0_Designing_Pricing.md"),
					autumnModellingPricingPlansContent,
					"utf-8",
				);
				created.unshift("0_Designing_Pricing.md");
			}

			setFilesCreated(created);
			setState("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create guides");
			setState("error");
		}
	};

	return { create, state, filesCreated, error, guidesDir: GUIDES_DIR };
}
