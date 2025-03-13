function SidebarItem({
  icon,
  text,
  active = false,
}: {
  icon: string;
  text: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer hover:bg-gray-100 ${
        active ? "bg-gray-100" : ""
      }`}
    >
      <span>{icon}</span>
      <span className="text-sm text-t2">{text}</span>
    </div>
  );
}

export default function DemoSidebar() {
  return (
    <div className="w-[250px] bg-stone-100 border-r flex flex-col h-screen">
      <div className="p-4 flex items-center gap-2 border-b">
        <div className="w-6 h-6 rounded-full bg-gray-900"></div>
        <span className="font-medium">autumn</span>
      </div>

      <div className="flex flex-col h-full p-2 space-y-1">
        <SidebarItem icon="📊" text="Overview" active />
        <SidebarItem icon="📝" text="Editor" />
        <SidebarItem icon="📈" text="Analytics" />
        <SidebarItem icon="⚙️" text="Settings" />

        <div className="flex flex-col h-full justify-between">
          <div>
            <div className="text-xs text-gray-500 px-3 pt-4 pb-2">Products</div>
            <SidebarItem icon="💬" text="Chat" />
            <SidebarItem icon="🤖" text="Assistant" />
            <SidebarItem icon="🔒" text="Authentication" />
            <SidebarItem icon="🧩" text="Add-ons" />
          </div>
          <div className="">
            <SidebarItem icon="📚" text="Documentation" />
            <SidebarItem icon="👥" text="Invite" />
            <SidebarItem icon="❓" text="Support" />
          </div>
        </div>
      </div>
    </div>
  );
}
