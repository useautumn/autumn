import { XIcon } from "lucide-react";
import { useState } from "react";

interface SheetCloseButtonProps {
	onClose: () => void;
}

export const SheetCloseButton = ({ onClose }: SheetCloseButtonProps) => {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<button
			type="button"
			onClick={onClose}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			className="ring-offset-background focus:ring-ring absolute top-4 right-2 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
			aria-label="Close"
		>
			<XIcon className="size-4" />
		</button>
	);
};
