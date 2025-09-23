import type { ReactNode } from "react";

interface PanelButtonProps {
	isSelected: boolean;
	onClick: () => void;
	icon: ReactNode;
	className?: string;
}

export function PanelButton({
	isSelected,
	onClick,
	icon,
	className = "",
}: PanelButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`panel-button ${
				isSelected ? "panel-button-selected" : "panel-button-unselected"
			} ${className}`}
		>
			{/* Vertical seams */}
			<div className="panel-seam left-1/4" />
			<div className="panel-seam left-1/2" />
			<div className="panel-seam left-3/4" />

			{/* Screws in corners */}
			<div
				className={`panel-screw top-2 left-2 ${isSelected ? "panel-screw-selected" : "panel-screw-unselected"}`}
			/>
			<div
				className={`panel-screw top-2 right-2 ${isSelected ? "panel-screw-selected" : "panel-screw-unselected"}`}
			/>
			<div
				className={`panel-screw bottom-2 left-2 ${isSelected ? "panel-screw-selected" : "panel-screw-unselected"}`}
			/>
			<div
				className={`panel-screw bottom-2 right-2 ${isSelected ? "panel-screw-selected" : "panel-screw-unselected"}`}
			/>

			{/* Icon container */}
			<div
				className={`panel-icon-container ${isSelected ? "panel-icon-container-selected" : "panel-icon-container-unselected"}`}
			>
				<div
					className={
						isSelected ? "panel-icon-selected" : "panel-icon-unselected"
					}
				>
					{icon}
				</div>
			</div>
		</button>
	);
}
