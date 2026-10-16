import { afterAll, beforeEach, expect, mock, test } from "bun:test";

const originalSonnerModule = { ...(await import("sonner")) };
const originalClipboard = Object.getOwnPropertyDescriptor(
	globalThis.navigator,
	"clipboard",
);
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

afterAll(() => {
	mock.module("sonner", () => originalSonnerModule);
	if (originalClipboard)
		Object.defineProperty(globalThis.navigator, "clipboard", originalClipboard);
	else Reflect.deleteProperty(globalThis.navigator, "clipboard");
});

beforeEach(() => {
	toastSuccess.mockReset();
	toastError.mockReset();
	writeText.mockReset();
});

test("a rejected clipboard write shows an error toast and no success toast", async () => {
	writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));

	const copied = await copyToClipboard({
		text: "https://checkout",
		successMessage: "Copied",
	});

	expect(copied).toBe(false);

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

	const copied = await copyToClipboard({
		text: "{}",
		successMessage: "Copied",
	});

	expect(copied).toBe(true);

	expect(writeText).toHaveBeenCalledWith("{}");
	expect(toastSuccess).toHaveBeenCalledWith("Copied");
	expect(toastError).not.toHaveBeenCalled();
});
