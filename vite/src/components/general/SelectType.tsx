export const SelectType = ({
  title,
  description,
  icon,
  isSelected,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
}) => {
  return (
    <div
      className={`h-fit flex flex-col gap-2 text-sm p-2 rounded-xs cursor-pointer ${
        isSelected
          ? "shadow-inner bg-stone-100 border border-zinc-200"
          : "border"
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-1">
        <div className="flex w-4 h-full items-center justify-start">{icon}</div>
        <span className="text-t2 text-sm font-medium whitespace-nowrap">
          {title}
        </span>
      </div>
      <p className="text-t2 text-xs">{description}</p>
    </div>
  );
};
