import React from "react";

export const DemoSidebar = ({ items, activeItem, setActiveItem }: any) => {
  const MenuItem = ({ item, isActive, onClick }: any) => (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-muted ${
        isActive ? "bg-muted" : ""
      }`}
    >
      <span className="text-sm">{item.title}</span>
    </div>
  );

  return (
    <div className="w-[250px] bg-background border-r flex flex-col h-screen">
      <div className="flex items-center gap-2 p-4 border-b">
        <div className="w-6 h-6 rounded-full bg-primary"></div>
        <span className="font-semibold">Demo Mode</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {items.map((item: any) => (
          <MenuItem
            key={item.id}
            item={item}
            isActive={activeItem === item.id}
            onClick={() => setActiveItem(item.id)}
          />
        ))}
      </div>
    </div>
  );
};
