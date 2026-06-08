"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { AnimatePresence, MotionConfig, Variants, motion } from "framer-motion"
import { ArrowLeftIcon } from "lucide-react"

import { cn } from "../../utils/cn"
import { MetalButton } from "./metal-button"

const TRANSITION = {
  type: "spring" as const,
  bounce: 0.1,
  duration: 0.4,
}

interface FloatingPanelContextType {
  isOpen: boolean
  openFloatingPanel: (rect: DOMRect) => void
  closeFloatingPanel: () => void
  uniqueId: string
  note: string
  setNote: (note: string) => void
  triggerRect: DOMRect | null
  title: string
  setTitle: (title: string) => void
}

const FloatingPanelContext = createContext<
  FloatingPanelContextType | undefined
>(undefined)

export function useFloatingPanel() {
  const context = useContext(FloatingPanelContext)
  if (!context) {
    throw new Error(
      "useFloatingPanel must be used within a FloatingPanelProvider"
    )
  }
  return context
}

function useFloatingPanelLogic(controlledIsOpen?: boolean, setControlledIsOpen?: (open: boolean) => void) {
  const uniqueId = useId()
  const [localIsOpen, setLocalIsOpen] = useState(false)
  
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : localIsOpen
  const setIsOpen = (open: boolean) => {
    if (setControlledIsOpen) {
      setControlledIsOpen(open)
    } else {
      setLocalIsOpen(open)
    }
  }

  const [note, setNote] = useState("")
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const [title, setTitle] = useState("")

  const openFloatingPanel = (rect: DOMRect) => {
    setTriggerRect(rect)
    setIsOpen(true)
  }
  const closeFloatingPanel = () => {
    setIsOpen(false)
    setNote("")
  }

  return {
    isOpen,
    openFloatingPanel,
    closeFloatingPanel,
    uniqueId,
    note,
    setNote,
    triggerRect,
    title,
    setTitle,
  }
}

interface FloatingPanelRootProps {
  children: React.ReactNode
  className?: string
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function FloatingPanelRoot({
  children,
  className,
  isOpen,
  onOpenChange,
}: FloatingPanelRootProps) {
  const floatingPanelLogic = useFloatingPanelLogic(isOpen, onOpenChange)

  return (
    <FloatingPanelContext.Provider value={floatingPanelLogic}>
      <MotionConfig transition={TRANSITION}>
        <div className={cn("relative", className)}>{children}</div>
      </MotionConfig>
    </FloatingPanelContext.Provider>
  )
}

interface FloatingPanelTriggerProps {
  children: React.ReactNode
  className?: string
  title: string
}

export function FloatingPanelTrigger({
  children,
  className,
  title,
}: FloatingPanelTriggerProps) {
  const { openFloatingPanel, uniqueId, setTitle } = useFloatingPanel()
  const triggerRef = useRef<HTMLDivElement>(null)

  const handleClick = () => {
    if (triggerRef.current) {
      openFloatingPanel(triggerRef.current.getBoundingClientRect())
      setTitle(title)
    }
  }

  return (
    <MetalButton
      ref={triggerRef}
      preset="chromatic"
      onClick={handleClick}
      className={cn("border-none text-xs font-bold rounded-2xl h-auto py-2 px-4 shadow-md leading-none", className)}
      aria-haspopup="dialog"
      aria-expanded={false}
    >
      {children}
    </MetalButton>
  )
}

interface FloatingPanelContentProps {
  children: React.ReactNode
  className?: string
}

export function FloatingPanelContent({
  children,
  className,
}: FloatingPanelContentProps) {
  const { isOpen, closeFloatingPanel, uniqueId, title } =
    useFloatingPanel()
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node)
      ) {
        closeFloatingPanel()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [closeFloatingPanel])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFloatingPanel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [closeFloatingPanel])

  const variants: Variants = {
    hidden: { opacity: 0, scale: 0.9, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0 },
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0, 0, 0, 0)" }}
            animate={{ backdropFilter: "blur(4px)", backgroundColor: "rgba(0, 0, 0, 0.4)" }}
            exit={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(0, 0, 0, 0)" }}
            className="fixed inset-0 z-40 transition-all duration-300"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              ref={contentRef}
              layoutId={`floating-panel-${uniqueId}`}
              className={cn(
                "overflow-hidden border border-zinc-950/10 bg-white shadow-lg outline-none dark:border-zinc-50/10 dark:bg-zinc-800 pointer-events-auto",
                className
              )}
              style={{
                borderRadius: 12,
              }}
              initial="hidden"
              animate="visible"
              exit="hidden"
            variants={variants}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`floating-panel-title-${uniqueId}`}
          >
            <FloatingPanelTitle>{title}</FloatingPanelTitle>
            {children}
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

interface FloatingPanelTitleProps {
  children: React.ReactNode
}

function FloatingPanelTitle({ children }: FloatingPanelTitleProps) {
  const { uniqueId } = useFloatingPanel()

  return (
    <motion.div
      layoutId={`floating-panel-label-container-${uniqueId}`}
      className="px-4 py-2 bg-white dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700"
    >
      <motion.div
        layoutId={`floating-panel-label-${uniqueId}`}
        className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        id={`floating-panel-title-${uniqueId}`}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

interface FloatingPanelFormProps {
  children: React.ReactNode
  onSubmit?: (note: string) => void
  className?: string
}

export function FloatingPanelForm({
  children,
  onSubmit,
  className,
}: FloatingPanelFormProps) {
  const { note, closeFloatingPanel } = useFloatingPanel()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.(note)
    closeFloatingPanel()
  }

  return (
    <form
      className={cn("flex h-full flex-col", className)}
      onSubmit={handleSubmit}
    >
      {children}
    </form>
  )
}

interface FloatingPanelLabelProps {
  children: React.ReactNode
  htmlFor: string
  className?: string
}

export function FloatingPanelLabel({
  children,
  htmlFor,
  className,
}: FloatingPanelLabelProps) {
  const { note } = useFloatingPanel()

  return (
    <motion.label
      htmlFor={htmlFor}
      style={{ opacity: note ? 0 : 1 }}
      className={cn(
        "block mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100",
        className
      )}
    >
      {children}
    </motion.label>
  )
}

interface FloatingPanelTextareaProps {
  className?: string
  id?: string
}

export function FloatingPanelTextarea({
  className,
  id,
}: FloatingPanelTextareaProps) {
  const { note, setNote } = useFloatingPanel()

  return (
    <textarea
      id={id}
      className={cn(
        "h-full w-full resize-none rounded-md bg-transparent px-4 py-3 text-sm outline-none",
        className
      )}
      autoFocus
      value={note}
      onChange={(e) => setNote(e.target.value)}
    />
  )
}

interface FloatingPanelHeaderProps {
  children: React.ReactNode
  className?: string
}

export function FloatingPanelHeader({
  children,
  className,
}: FloatingPanelHeaderProps) {
  return (
    <motion.div
      className={cn(
        "px-4 py-2 font-semibold text-zinc-900 dark:text-zinc-100",
        className
      )}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      {children}
    </motion.div>
  )
}

interface FloatingPanelBodyProps {
  children: React.ReactNode
  className?: string
}

export function FloatingPanelBody({
  children,
  className,
}: FloatingPanelBodyProps) {
  return (
    <motion.div
      className={cn("p-4", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

interface FloatingPanelFooterProps {
  children: React.ReactNode
  className?: string
}

export function FloatingPanelFooter({
  children,
  className,
}: FloatingPanelFooterProps) {
  return (
    <motion.div
      className={cn("flex justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-700", className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {children}
    </motion.div>
  )
}

interface FloatingPanelCloseButtonProps {
  className?: string
}

export function FloatingPanelCloseButton({
  className,
}: FloatingPanelCloseButtonProps) {
  const { closeFloatingPanel } = useFloatingPanel()

  return (
    <motion.button
      type="button"
      className={cn("flex items-center px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold transition", className)}
      onClick={closeFloatingPanel}
      aria-label="Close floating panel"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <ArrowLeftIcon size={12} className="mr-1 text-zinc-500" />
      <span>Back</span>
    </motion.button>
  )
}

interface FloatingPanelSubmitButtonProps {
  className?: string
  label?: string
}

export function FloatingPanelSubmitButton({
  className,
  label = "Submit",
}: FloatingPanelSubmitButtonProps) {
  return (
    <motion.button
      className={cn(
        "relative ml-1 flex h-8 shrink-0 scale-100 select-none appearance-none items-center justify-center rounded-lg bg-indigo-600 px-3 text-xs text-white font-bold transition-colors hover:bg-indigo-700 focus-visible:ring-2 active:scale-[0.98]",
        className
      )}
      type="submit"
      aria-label="Submit"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {label}
    </motion.button>
  )
}

interface FloatingPanelButtonProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}

export function FloatingPanelButton({
  children,
  onClick,
  className,
}: FloatingPanelButtonProps) {
  return (
    <motion.button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700",
        className
      )}
      onClick={onClick}
      whileHover={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.button>
  )
}
