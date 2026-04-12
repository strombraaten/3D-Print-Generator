import * as React from "react"
import { Sun, Moon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light")

  // Read current theme from DOM on mount
  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark")
    setTheme(isDark ? "dark" : "light")
  }, [])

  // Sync DOM class and localStorage when theme changes
  React.useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  function toggle() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle color theme"
      className="text-muted-foreground hover:text-foreground"
    >
      {/* Sun: visible in light mode, hidden in dark */}
      <Sun
        size={18}
        className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90 absolute"
      />
      {/* Moon: hidden in light mode, visible in dark */}
      <Moon
        size={18}
        className="scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0 absolute"
      />
      <span className="sr-only">Toggle color theme</span>
    </Button>
  )
}
