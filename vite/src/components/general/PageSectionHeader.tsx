export const PageSectionHeader = ({ title }: { title: string }) => {
  return (
    <div className="sticky top-0 z-10 border-y bg-stone-100 pl-10 pr-7 h-10 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <h2 className="text-sm text-t2 font-medium">{title}</h2>
      </div>
    </div>
  );
};
