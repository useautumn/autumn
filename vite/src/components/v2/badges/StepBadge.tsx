export const StepBadge = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="w-6 h-6 p-2.5 bg-white rounded-md shadow-[inset_0px_-3px_4px_0px_rgba(0,0,0,0.04)] outline-1 outline-offset-[-1px] outline-neutral-300 inline-flex justify-center items-center gap-2.5">
			<div className="justify-start text-violet-600 text-sm font-semibold font-['Inter']">
				{children}
			</div>
		</div>
	);
};
