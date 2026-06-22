import { z } from "zod/v4";

const allowedChars = "Use only letters, numbers, underscores, hyphens, and colons.";

export const CustomerIdSchema = z
	.string()
	.refine(
		(val) => {
			if (val === "") return false;
			if (val.includes("@")) return false;
			if (val.includes(" ")) return false;
			if (val.includes(".")) return false;
			return /^[a-zA-Z0-9_:-]+$/.test(val);
		},
		{
			error: (issue) => {
				const input = issue.input as string;
				if (input === "") return { message: "can't be an empty string" };
				if (input.includes("@"))
					return { message: `cannot contain @ symbol. ${allowedChars}` };
				if (input.includes(" "))
					return { message: `cannot contain spaces. ${allowedChars}` };
				if (input.includes("."))
					return { message: `cannot contain periods. ${allowedChars}` };
				const invalidChar = input.match(/[^a-zA-Z0-9_:-]/)?.[0];
				return {
					message: `cannot contain '${invalidChar}'. ${allowedChars}`,
				};
			},
		},
	)
	.describe("Your unique identifier for the customer")
	.meta({
		title: "CustomerId",
		description: "Your unique identifier for the customer",
	});
