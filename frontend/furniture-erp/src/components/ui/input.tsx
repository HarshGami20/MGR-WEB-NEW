import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    const setRef = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      },
      [ref],
    )

    React.useEffect(() => {
      const el = inputRef.current
      if (!el || type !== "number") return
      const stopWheelChangingValue = (e: WheelEvent) => {
        e.preventDefault()
      }
      el.addEventListener("wheel", stopWheelChangingValue, { passive: false })
      return () => el.removeEventListener("wheel", stopWheelChangingValue)
    }, [type])

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={setRef}
        onWheel={onWheel}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
