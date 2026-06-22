import { XIcon } from "lucide-react";

interface SheetCloseButtonProps {
	onClose: () => void;
}

export const SheetCloseButton = ({ onClose }: SheetCloseButtonProps) => {
	return (
		<button
			type="button"
			onClick={onClose}
			className="ring-offset-background focus:ring-ring absolute top-3 right-3 md:top-4 md:right-4 flex items-center justify-center size-10 md:size-auto rounded-sm md:rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none z-10"
			aria-label="Close"
		>
			<XIcon className="size-5 md:size-4" />
		</button>
	);
};
