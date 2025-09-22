import { LucideLoaderCircle } from "lucide-react";

function SmallSpinner({ size = 18 }: { size?: number }) {
	return (
		<LucideLoaderCircle
			className="animate-spin text-t3"
			size={size}
			color="#c4c4c4"
		/>
	);
}

export default SmallSpinner;
