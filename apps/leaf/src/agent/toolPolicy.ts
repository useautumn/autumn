const labels: Record<string, string> = {
	attach: "Attach plan",
	updateSubscription: "Update subscription",
	createSchedule: "Create schedule",
	createBalance: "Create balance",
	createPlan: "Create plan",
};

const previewWriteTools: Record<string, string> = {
	previewAttach: "attach",
	previewUpdateSubscription: "updateSubscription",
	previewCreateSchedule: "createSchedule",
	previewCreateBalance: "createBalance",
};

export const getWriteToolForPreview = (toolName: string) =>
	previewWriteTools[toolName.replace(/^autumn_/, "")];

export const toolLabel = (toolName: string) =>
	labels[toolName.replace(/^autumn_/, "")] ??
	toolName
		.replace(/^autumn_/, "")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (char) => char.toUpperCase());
