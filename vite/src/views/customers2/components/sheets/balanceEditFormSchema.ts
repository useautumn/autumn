import { BillingInterval } from "@autumn/shared";
import { z } from "zod/v4";

export const BalanceEditFormSchema = z
	.object({
		mode: z.enum(["set", "add"]),
		balance: z.number().nullable(),
		grantedAndPurchasedBalance: z.number().nullable(),
		nextResetAt: z.number().nullable(),
		addValue: z.number().nullable(),
		autoTopUp: z.object({
			enabled: z.boolean(),
			threshold: z.number().min(0).nullable(),
			quantity: z.number().min(1).nullable(),
			maxPurchasesEnabled: z.boolean(),
			interval: z.enum(BillingInterval),
			maxPurchases: z.number().min(1).nullable(),
		}),
	})
	.check((ctx) => {
		const { mode, balance, addValue, autoTopUp } = ctx.value;

		if (mode === "set" && balance === null) {
			ctx.issues.push({
				code: "custom",
				message: "Please enter a valid balance",
				path: ["balance"],
			});
		}

		if (mode === "add" && (addValue === null || Number.isNaN(addValue))) {
			ctx.issues.push({
				code: "custom",
				message: "Please enter a valid amount",
				path: ["addValue"],
			});
		}

		if (autoTopUp.enabled) {
			if (autoTopUp.threshold === null || autoTopUp.threshold < 0) {
				ctx.issues.push({
					code: "custom",
					message: "Threshold must be 0 or above",
					path: ["autoTopUp", "threshold"],
				});
			}
			if (autoTopUp.quantity === null || autoTopUp.quantity < 1) {
				ctx.issues.push({
					code: "custom",
					message: "Quantity must be 1 or above",
					path: ["autoTopUp", "quantity"],
				});
			}
			if (autoTopUp.maxPurchasesEnabled) {
				if (autoTopUp.maxPurchases === null || autoTopUp.maxPurchases < 1) {
					ctx.issues.push({
						code: "custom",
						message: "Max purchases must be 1 or above",
						path: ["autoTopUp", "maxPurchases"],
					});
				}
			}
		}
	});

export type BalanceEditForm = z.infer<typeof BalanceEditFormSchema>;
