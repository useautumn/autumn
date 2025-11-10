export const TableHeading = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className="text-t3 text-md py-0 px-2 rounded-lg flex gap-2 items-center bg-secondary">
			{children}
		</div>
	);
};
