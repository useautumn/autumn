import { beforeEach, expect, mock, test } from "bun:test";

const toastSuccess = mock();
const toastError = mock();
mock.module("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

const writeText = mock();
Object.defineProperty(globalThis.navigator, "clipboard", {
	value: { writeText },
	configurable: true,
});

const { copyToClipboard } = await import("@/utils/clipboardUtils");

beforeEach(() => {
	toastSuccess.mockReset();
	toastError.mockReset();
	writeText.mockReset();
});

test("a rejected clipboard write shows an error toast and no success toast", async () => {
	writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

	await copyToClipboard({ text: "https://checkout", successMessage: "Copied" });

	expect(toastSuccess).not.toHaveBeenCalled();
	expect(toastError).toHaveBeenCalledTimes(1);
});

test("the error toast's retry action copies again from a fresh click", async () => {
	writeText.mockRejectedValueOnce(
		new DOMException("denied", "NotAllowedError"),
	);
	writeText.mockResolvedValueOnce(undefined);

	await copyToClipboard({ text: "https://checkout", successMessage: "Copied" });
	const { action } = toastError.mock.calls[0][1];
	await action.onClick();

	expect(writeText).toHaveBeenLastCalledWith("https://checkout");
	expect(toastSuccess).toHaveBeenCalledWith("Copied");
});

test("a successful clipboard write shows the success toast", async () => {
	writeText.mockResolvedValue(undefined);

	await copyToClipboard({ text: "{}", successMessage: "Copied" });

	expect(writeText).toHaveBeenCalledWith("{}");
	expect(toastSuccess).toHaveBeenCalledWith("Copied");
	expect(toastError).not.toHaveBeenCalled();
});
