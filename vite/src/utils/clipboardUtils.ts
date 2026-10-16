import { toast } from "sonner";

export const copyToClipboard = async ({
	text,
	successMessage,
}: {
	text: string;
	successMessage: string;
}) => {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		toast.error("Couldn't copy to clipboard", {
			action: {
				label: "Copy again",
				onClick: () => copyToClipboard({ text, successMessage }),
			},
		});
		return false;
	}
	toast.success(successMessage);
	return true;
};
