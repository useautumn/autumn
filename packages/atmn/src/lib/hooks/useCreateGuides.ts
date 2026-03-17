import fs from "node:fs/promises";
import path from "node:path";
import { useState } from "react";
import { customerPrompt } from "../../prompts/customer.js";
import { paymentsPrompt } from "../../prompts/payments.js";
import { pricingPrompt } from "../../prompts/pricing.js";
import { usagePrompt } from "../../prompts/usage.js";

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

			// Always write customer, payments, usage guides
			await fs.writeFile(
				path.join(guidesPath, "1_Customer_Creation.md"),
				customerPrompt,
				"utf-8",
			);
			created.push("1_Customer_Creation.md");

			await fs.writeFile(
				path.join(guidesPath, "2_Accepting_Payments.md"),
				paymentsPrompt,
				"utf-8",
			);
			created.push("2_Accepting_Payments.md");

			await fs.writeFile(
				path.join(guidesPath, "3_Tracking_Usage.md"),
				usagePrompt,
				"utf-8",
			);
			created.push("3_Tracking_Usage.md");

			// Only write pricing guide if user doesn't have pricing yet (or saveAll is true)
			if (options?.saveAll || !hasPricing) {
				await fs.writeFile(
					path.join(guidesPath, "0_Designing_Pricing.md"),
					pricingPrompt,
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
