import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalAttachment } from "./createEvalContext.js";

export const contractAttachment = ({
	filename = "document.pdf",
	fixtureId,
}: {
	filename?: string;
	fixtureId: string;
}): EvalAttachment => {
	const path = resolve(process.cwd(), "contracts", fixtureId, filename);
	const stats = statSync(path);

	return {
		mimeType: "application/pdf",
		name: `${fixtureId}.pdf`,
		path,
		size: stats.size,
	};
};
