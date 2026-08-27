import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { convertCancellationDetailsToStripe } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/convertCancellationDetailsToStripe";

describe(chalk.yellowBright("convertCancellationDetailsToStripe"), () => {
	test("maps Stripe feedback reason + details to feedback and comment", () => {
		expect(
			convertCancellationDetailsToStripe({
				cancellationDetails: {
					reason: "too_expensive",
					details: "Switching to a competitor",
				},
			}),
		).toEqual({
			feedback: "too_expensive",
			comment: "Switching to a competitor",
		});
	});

	test("puts a free-form reason into the comment", () => {
		expect(
			convertCancellationDetailsToStripe({
				cancellationDetails: {
					reason: "customer requested",
					details: "email from jane",
				},
			}),
		).toEqual({
			comment: "customer requested: email from jane",
		});
	});

	test("maps a feedback-only reason", () => {
		expect(
			convertCancellationDetailsToStripe({
				cancellationDetails: { reason: "unused" },
			}),
		).toEqual({
			feedback: "unused",
		});
	});

	test("maps details-only to comment", () => {
		expect(
			convertCancellationDetailsToStripe({
				cancellationDetails: { details: "just because" },
			}),
		).toEqual({
			comment: "just because",
		});
	});

	test("returns undefined when nothing is passed", () => {
		expect(
			convertCancellationDetailsToStripe({ cancellationDetails: undefined }),
		).toBeUndefined();
	});
});
