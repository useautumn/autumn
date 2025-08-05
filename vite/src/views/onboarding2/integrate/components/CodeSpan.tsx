export const CodeSpan = ({ children }: { children: React.ReactNode }) => {
  return (
    <span className="bg-stone-200 font-mono text-t2 px-1 py-0.5 rounded-md">
      {children}
    </span>
  );
};
