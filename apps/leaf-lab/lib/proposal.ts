import { z } from "zod";
import { schemaByTool } from "../../../packages/mcp/src/tools/index.js";

export const parseProposal = ({
	operation,
	output,
}: {
	operation: string;
	output: unknown;
}) => {
	const name = z.literal("attach").parse(operation);
	const envelope = z
		.object({
			status: z.enum(["proposal", "needs_context"]),
			request: z.record(z.unknown()).nullable(),
		})
		.parse(output);
	if (envelope.status !== "proposal" || !envelope.request)
		throw new Error(
			"Proposal requires more context; no billing action recorded",
		);
	return {
		name,
		args: {
			request: schemaByTool[name].parse(envelope.request),
			intent: "Construct the requested billing proposal",
		},
	};
};

export const checkPreview = ({
	request,
	preview,
}: {
	request: Record<string, unknown>;
	preview: unknown;
}) => {
	const result = z
		.object({
			customer_id: z.string(),
			currency: z.string(),
			total: z.number().finite(),
			plan_id: z.string().optional(),
			incoming: z
				.array(z.object({ plan_id: z.string() }).passthrough())
				.optional(),
		})
		.passthrough()
		.parse(preview);
	if (result.customer_id !== request.customer_id)
		throw new Error("Preview customer does not match the proposal");
	if (typeof request.plan_id === "string") {
		const plans =
			result.incoming?.map((plan) => plan.plan_id) ??
			(result.plan_id ? [result.plan_id] : []);
		if (!plans.includes(request.plan_id))
			throw new Error("Preview does not confirm the proposed plan");
	}
	return result;
};

export const describeProposal = ({
	request,
	preview,
	customerName,
	planName,
}: {
	request: Record<string, unknown>;
	preview: ReturnType<typeof checkPreview>;
	customerName: string;
	planName: string;
}) => {
	const invoice = request.invoice_mode as
		| { enabled?: boolean; finalize?: boolean }
		| undefined;
	return [
		`${planName} for ${customerName}.`,
		`Preview total: ${preview.currency.toUpperCase()} ${preview.total}.`,
		...(invoice?.enabled
			? [
					invoice.finalize === false
						? "A draft invoice will be created after approval."
						: "An invoice will be created after approval.",
				]
			: []),
		...(request.enable_plan_immediately === true
			? ["Access starts when the approved request executes."]
			: []),
		"Awaiting approval; nothing has been applied.",
	].join("\n");
};
