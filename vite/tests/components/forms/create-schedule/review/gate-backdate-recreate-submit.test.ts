import { expect, mock, test } from "bun:test";
import type { SetPlansPreviewWarning } from "@autumn/shared";
import { gateBackdateRecreateSubmit } from "@/components/forms/create-schedule/utils/review/gateBackdateRecreateSubmit";

const recreateWarning = {
	type: "subscription_recreated_backdated",
	severity: "warning",
	message: "The subscription will be recreated.",
} as SetPlansPreviewWarning;

const gate = ({ warnings }: { warnings: SetPlansPreviewWarning[] }) => {
	const submit = mock(() => {});
	const requestConfirm = mock((_submit: () => void) => {});
	gateBackdateRecreateSubmit({ warnings, submit, requestConfirm });
	return { submit, requestConfirm };
};

test("a submit that recreates the subscription waits for the confirm, which then runs it", () => {
	const { submit, requestConfirm } = gate({ warnings: [recreateWarning] });

	expect(submit).not.toHaveBeenCalled();
	expect(requestConfirm).toHaveBeenCalledWith(submit);
});

test("a submit that keeps the subscription runs straight away", () => {
	const { submit, requestConfirm } = gate({ warnings: [] });

	expect(submit).toHaveBeenCalledTimes(1);
	expect(requestConfirm).not.toHaveBeenCalled();
});
