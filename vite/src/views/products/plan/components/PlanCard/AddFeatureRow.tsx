import { PlusIcon } from "@phosphor-icons/react";

interface AddFeatureRowProps {
	onClick?: () => void;
	disabled?: boolean;
}

export const AddFeatureRow = ({ onClick, disabled }: AddFeatureRowProps) => {
	return (
		<button
			type="button"
			className="group/btn flex items-center justify-center bg-white border border-border rounded-lg h-[30px] w-full shadow-[0px_4px_4px_rgba(0,0,0,0.02),_inset_0px_-3px_4px_rgba(0,0,0,0.04)] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed form-input"
			onClick={onClick}
			tabIndex={0}
			disabled={disabled}
			aria-label="Add new feature"
		>
			<div
				className={
					disabled
						? "text-t6"
						: "text-t3 group-hover/btn:text-primary transition-colors"
				}
			>
				<PlusIcon size={16} weight="regular" />
			</div>
		</button>
	);
};
