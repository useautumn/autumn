export const TableHeading = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="text-t2 text-md py-0 px-2 rounded-lg flex gap-2 items-center">
			{children}
		</div>
	);
};
