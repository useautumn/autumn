import { z } from "zod/v4";

export const BalanceEditFormSchema = z
	.object({
		mode: z.enum(["set", "add"]),
		balance: z.number().nullable(),
		grantedAndPurchasedBalance: z.number().nullable(),
		nextResetAt: z.number().nullable(),
		addValue: z.number().nullable(),
	})
	.check((ctx) => {
		const { mode, balance, addValue } = ctx.value;

		if (mode === "set" && balance === null) {
			ctx.issues.push({
				code: "custom",
				message: "Please enter a valid balance",
				path: ["balance"],
				input: balance,
			});
		}

		if (mode === "add" && (addValue === null || Number.isNaN(addValue))) {
			ctx.issues.push({
				code: "custom",
				message: "Please enter a valid amount",
				path: ["addValue"],
				input: addValue,
			});
		}
	});

export type BalanceEditForm = z.infer<typeof BalanceEditFormSchema>;
