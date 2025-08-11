export const StepHeader = ({
  number,
  title,
}: {
  number: number;
  title: React.ReactNode;
}) => {
  return (
    <div className="flex items-center gap-4">
      <div className="w-6 h-6 border-1 rounded-full bg-gradient-to-b from-stone-100 to-stone-100 text-primary font-bold flex items-center justify-center text-sm">
        {number}
      </div>
      <div className="text-md">{title}</div>
    </div>
  );
};
