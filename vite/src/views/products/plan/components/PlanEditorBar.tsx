export const PlanEditorBar = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="absolute bottom-0 left-0 right-0 flex justify-center items-center h-40 pb-4 pointer-events-none z-50 animate-in fade-in-0 slide-in-from-bottom-10 duration-300">
			<div className="flex items-center gap-2 p-2 rounded-xl border border-input bg-outer-background pointer-events-auto shadow-xl">
				{children}
			</div>
		</div>
	);
};
