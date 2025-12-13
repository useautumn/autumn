export const EmptyState = ({ text }: { text: string | React.ReactNode }) => {
	return (
		<div className="flex justify-center items-center py-4 border-dashed border rounded-lg h-13 w-full shadow-sm">
			<p className="text-sm text-t4">{text}</p>
		</div>
	);
};
