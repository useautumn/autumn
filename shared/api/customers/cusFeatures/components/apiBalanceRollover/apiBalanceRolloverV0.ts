import z from "zod/v4";

export const ApiBalanceRolloverV0Schema = z.object({
	balance: z.number(),
	expires_at: z.number(),
});
export type ApiBalanceRolloverV0 = z.infer<typeof ApiBalanceRolloverV0Schema>;
