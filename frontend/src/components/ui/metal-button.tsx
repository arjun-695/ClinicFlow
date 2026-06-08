"use client"

/**
 * `metal-fx` around `Button` — liquid metal ring for controls.
 * `className` styles the button; `metalFxClassName` styles the MetalFx wrapper.
 *
 * With `normalizeHostStyles` (default), variant fills live on the MetalFx wrapper
 * and the button stays transparent so the shader ring stays visible. Pass
 * `normalizeHostStyles={false}` to keep all shadcn chrome on the button (filled
 * variants will cover most of the metal).
 */
import type { ComponentProps, CSSProperties } from "react"
import { forwardRef } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { MetalFx, type MetalFxProps, type MetalFxVariant } from "metal-fx"

import { cn } from "../../utils/cn"
import { Button } from "./button"

const metalSurfaceVariants = cva("transition-colors", {
  variants: {
    variant: {
      default: "bg-indigo-600! text-white! hover:bg-indigo-700!",
      outline:
        "bg-[var(--card)]! text-[var(--foreground)]! hover:bg-[var(--card-hover)]! dark:bg-[var(--input-bg)]! dark:hover:bg-[var(--card-hover)]!",
      secondary:
        "bg-slate-100! text-slate-900! hover:bg-slate-200! dark:bg-slate-800! dark:text-slate-100! dark:hover:bg-slate-700!",
      ghost:
        "bg-transparent! text-[var(--foreground)]! hover:bg-[var(--card-hover)]! dark:hover:bg-[var(--card-hover)]!",
      destructive:
        "bg-red-600/10! text-red-600! hover:bg-red-600/20! dark:bg-red-600/20! dark:hover:bg-red-600/30!",
      link: "bg-transparent! text-indigo-600!",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

/** Strip outer chrome on the host; MetalFx punches the ring around the interior. */
const metalHostChromeReset =
  "border-0! bg-transparent! shadow-none! hover:bg-transparent! aria-expanded:bg-transparent!"

/** Keep a stable edge above the animated shader so bright frames cannot erase it. */
const metalStableEdge =
  "relative isolate before:pointer-events-none before:absolute before:inset-0 before:z-10 before:rounded-[inherit] before:ring-1 before:ring-border/70 before:ring-inset dark:before:ring-border/80"

type MetalSurfaceVariant = NonNullable<
  VariantProps<typeof metalSurfaceVariants>["variant"]
>

type MetalShellProps = Pick<
  MetalFxProps,
  | "preset"
  | "theme"
  | "strength"
  | "paused"
  | "borderRadius"
  | "disableGlow"
  | "reflectionTargets"
  | "shaderScale"
  | "ringCssPx"
  | "scale"
  | "normalizeHostStyles"
> & {
  metalVariant?: MetalFxVariant
  metalFxClassName?: string
  metalFxStyle?: CSSProperties
}

export type MetalButtonProps = ComponentProps<typeof Button> & MetalShellProps

export type MetalIconButtonProps = MetalButtonProps

export const MetalButton = forwardRef<HTMLDivElement, MetalButtonProps>(
  function MetalButton(
    {
      metalVariant = "button",
      metalFxClassName,
      metalFxStyle,
      preset = "chromatic",
      theme = "auto",
      strength = 0.9,
      paused,
      borderRadius,
      disableGlow,
      reflectionTargets,
      shaderScale,
      ringCssPx,
      scale,
      normalizeHostStyles = true,
      variant = "default",
      className,
      ...buttonProps
    },
    ref
  ) {
    const surfaceVariant = variant as MetalSurfaceVariant

    return (
      <MetalFx
        borderRadius={borderRadius}
        className={cn(
          "overflow-visible! inline-flex w-fit min-w-0 flex-col items-stretch leading-none",
          metalStableEdge,
          normalizeHostStyles &&
            metalSurfaceVariants({ variant: surfaceVariant }),
          metalFxClassName
        )}
        disableGlow={disableGlow}
        normalizeHostStyles={normalizeHostStyles}
        paused={paused}
        preset={preset}
        ref={ref}
        reflectionTargets={reflectionTargets}
        ringCssPx={ringCssPx}
        scale={scale}
        shaderScale={shaderScale}
        strength={strength}
        style={metalFxStyle}
        theme={theme}
        variant={metalVariant}
      >
        <Button
          className={cn(normalizeHostStyles && metalHostChromeReset, className)}
          variant={variant}
          {...buttonProps}
        />
      </MetalFx>
    )
  }
)

MetalButton.displayName = "MetalButton"

export const MetalIconButton = forwardRef<HTMLDivElement, MetalIconButtonProps>(
  function MetalIconButton(
    { size = "icon-sm", metalVariant = "circle", className, ...props },
    ref
  ) {
    return (
      <MetalButton
        className={cn(
          "leading-none! [&_svg]:block [&_svg]:shrink-0",
          className
        )}
        metalVariant={metalVariant}
        ref={ref}
        size={size}
        {...props}
      />
    )
  }
)

MetalIconButton.displayName = "MetalIconButton"
