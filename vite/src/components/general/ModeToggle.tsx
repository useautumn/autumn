import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme } from "@/components/general/ThemeProvider"
import { useSidebarContext } from "@/views/main-sidebar/SidebarContext"
import { useState } from "react"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()
  const { state } = useSidebarContext()
  const expanded = state === "expanded"
  const [isHovered, setIsHovered] = useState(false)

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  return (
    <button
      onClick={toggleTheme}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "cursor-pointer font-medium transition-all duration-100",
        "text-sm flex h-9 items-center text-t2 hover:text-primary w-full",
        "focus:outline-none"
      )}
    >
      <div
        className={cn(
          "flex justify-center w-4 h-4 items-center rounded-sm transition-all duration-100",
          expanded && "mr-2",
          isHovered && "translate-x-[-1px]",
        )}
      >
        <Sun className="h-[14px] w-[14px] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-[14px] w-[14px] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </div>
      <span
        className={cn(
          "transition-all duration-200 whitespace-nowrap",
          expanded
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
        )}
      >
        Toggle theme
      </span>
    </button>
  )
}