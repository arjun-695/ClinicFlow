"use client";

import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useState } from "react";

import { cn } from "@/utils/cn";

export type AnimationVariant =
  | "circle"
  | "rectangle"
  | "gif"
  | "polygon"
  | "circle-blur";

export type AnimationStart =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "top-center"
  | "bottom-center"
  | "bottom-up"
  | "top-down"
  | "left-right"
  | "right-left";

interface Animation {
  name: string;
  css: string;
}

const getPositionCoords = (position: AnimationStart) => {
  switch (position) {
    case "top-left":
      return { cx: "0", cy: "0" };
    case "top-right":
      return { cx: "40", cy: "0" };
    case "bottom-left":
      return { cx: "0", cy: "40" };
    case "bottom-right":
      return { cx: "40", cy: "40" };
    case "top-center":
      return { cx: "20", cy: "0" };
    case "bottom-center":
      return { cx: "20", cy: "40" };
    // For directional positions, default to center (these are used for rectangle variant)
    case "bottom-up":
    case "top-down":
    case "left-right":
    case "right-left":
      return { cx: "20", cy: "20" };
  }
};

const generateSVG = (variant: AnimationVariant, start: AnimationStart) => {
  // circle-blur variant handles center case differently, so check it first
  if (variant === "circle-blur") {
    if (start === "center") {
      return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="20" cy="20" r="18" fill="white" filter="url(%23blur)"/></svg>`;
    }
    const positionCoords = getPositionCoords(start);
    if (!positionCoords) {
      throw new Error(`Invalid start position: ${start}`);
    }
    const { cx, cy } = positionCoords;
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><filter id="blur"><feGaussianBlur stdDeviation="2"/></filter></defs><circle cx="${cx}" cy="${cy}" r="18" fill="white" filter="url(%23blur)"/></svg>`;
  }

  if (start === "center") return;

  // Rectangle variant doesn't use SVG masks, so return early
  if (variant === "rectangle") return "";

  const positionCoords = getPositionCoords(start);
  if (!positionCoords) {
    throw new Error(`Invalid start position: ${start}`);
  }
  const { cx, cy } = positionCoords;

  if (variant === "circle") {
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="${cx}" cy="${cy}" r="20" fill="white"/></svg>`;
  }

  return "";
};

const getTransformOrigin = (start: AnimationStart) => {
  switch (start) {
    case "top-left":
      return "top left";
    case "top-right":
      return "top right";
    case "bottom-left":
      return "bottom left";
    case "bottom-right":
      return "bottom right";
    case "top-center":
      return "top center";
    case "bottom-center":
      return "bottom center";
    // For directional positions, default to center
    case "bottom-up":
    case "top-down":
    case "left-right":
    case "right-left":
      return "center";
  }
};

export const createAnimation = (
  variant: AnimationVariant,
  start: AnimationStart = "center",
  blur = false,
  url?: string,
): Animation => {
  const svg = generateSVG(variant, start);
  const transformOrigin = getTransformOrigin(start);

  if (variant === "rectangle") {
    const getClipPath = (direction: AnimationStart) => {
      switch (direction) {
        case "bottom-up":
          return {
            from: "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "top-down":
          return {
            from: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "left-right":
          return {
            from: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "right-left":
          return {
            from: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "top-left":
          return {
            from: "polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "top-right":
          return {
            from: "polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "bottom-left":
          return {
            from: "polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        case "bottom-right":
          return {
            from: "polygon(100% 100%, 100% 100%, 100% 100%, 100% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
        default:
          return {
            from: "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)",
            to: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
          };
      }
    };

    const clipPath = getClipPath(start);

    return {
      name: `${variant}-${start}${blur ? "-blur" : ""}`,
      css: `
       ::view-transition-group(root) {
        animation-duration: 1.8s;
        animation-timing-function: var(--expo-out);
      }
            
      ::view-transition-new(root) {
        animation-name: reveal-light-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: none;
        z-index: -1;
      }
      .dark::view-transition-new(root) {
        animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
        from {
          clip-path: ${clipPath.from};
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: ${clipPath.to};
          ${blur ? "filter: blur(0px);" : ""}
        }
      }

      @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
        from {
          clip-path: ${clipPath.from};
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: ${clipPath.to};
          ${blur ? "filter: blur(0px);" : ""}
        }
      }
      `,
    };
  }
  if (variant === "circle" && start == "center") {
    return {
      name: `${variant}-${start}${blur ? "-blur" : ""}`,
      css: `
       ::view-transition-group(root) {
        animation-duration: 1.8s;
        animation-timing-function: var(--expo-out);
      }
            
      ::view-transition-new(root) {
        animation-name: reveal-light${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: none;
        z-index: -1;
      }
      .dark::view-transition-new(root) {
        animation-name: reveal-dark${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      @keyframes reveal-dark${blur ? "-blur" : ""} {
        from {
          clip-path: circle(0% at 50% 50%);
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: circle(100.0% at 50% 50%);
          ${blur ? "filter: blur(0px);" : ""}
        }
      }

      @keyframes reveal-light${blur ? "-blur" : ""} {
        from {
           clip-path: circle(0% at 50% 50%);
           ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: circle(100.0% at 50% 50%);
          ${blur ? "filter: blur(0px);" : ""}
        }
      }
      `,
    };
  }
  if (variant === "gif") {
    return {
      name: `${variant}-${start}`,
      css: `
      ::view-transition-group(root) {
  animation-timing-function: var(--expo-in);
}

::view-transition-new(root) {
  mask: url('${url}') center / 0 no-repeat;
  animation: scale 4.5s;
}

::view-transition-old(root),
.dark::view-transition-old(root) {
  animation: scale 4.5s;
}

@keyframes scale {
  0% {
    mask-size: 0;
  }
  10% {
    mask-size: 50vmax;
  }
  90% {
    mask-size: 50vmax;
  }
  100% {
    mask-size: 2000vmax;
  }
}`,
    };
  }

  if (variant === "circle-blur") {
    if (start === "center") {
      return {
        name: `${variant}-${start}`,
        css: `
        ::view-transition-group(root) {
          animation-timing-function: var(--expo-out);
        }

        ::view-transition-new(root) {
          mask: url('${svg}') center / 0 no-repeat;
          mask-origin: content-box;
          animation: scale 2.2s;
          transform-origin: center;
        }

        ::view-transition-old(root),
        .dark::view-transition-old(root) {
          animation: scale 2.2s;
          transform-origin: center;
          z-index: -1;
        }

        @keyframes scale {
          to {
            mask-size: 350vmax;
          }
        }
        `,
      };
    }

    return {
      name: `${variant}-${start}`,
      css: `
      ::view-transition-group(root) {
        animation-timing-function: var(--expo-out);
      }

      ::view-transition-new(root) {
        mask: url('${svg}') ${start.replace("-", " ")} / 0 no-repeat;
        mask-origin: content-box;
        animation: scale 2.2s;
        transform-origin: ${transformOrigin};
      }

      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: scale 2.2s;
        transform-origin: ${transformOrigin};
        z-index: -1;
      }

      @keyframes scale {
        to {
          mask-size: 350vmax;
        }
      }
      `,
    };
  }

  if (variant === "polygon") {
    const getPolygonClipPaths = (position: AnimationStart) => {
      switch (position) {
        case "top-left":
          return {
            darkFrom: "polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)",
            darkTo: "polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)",
            lightFrom: "polygon(171% 50%, 50% 171%, 50% 171%, 171% 50%)",
            lightTo: "polygon(171% 50%, 50% 171%, -50% 71%, 50% -71%)",
          };
        case "top-right":
          return {
            darkFrom: "polygon(150% -71%, 250% 71%, 250% 71%, 150% -71%)",
            darkTo: "polygon(150% -71%, 250% 71%, 50% 171%, -71% 50%)",
            lightFrom: "polygon(-71% 50%, 50% 171%, 50% 171%, -71% 50%)",
            lightTo: "polygon(-71% 50%, 50% 171%, 250% 71%, 150% -71%)",
          };
        default:
          // Default to top-left behavior
          return {
            darkFrom: "polygon(50% -71%, -50% 71%, -50% 71%, 50% -71%)",
            darkTo: "polygon(50% -71%, -50% 71%, 50% 171%, 171% 50%)",
            lightFrom: "polygon(171% 50%, 50% 171%, 50% 171%, 171% 50%)",
            lightTo: "polygon(171% 50%, 50% 171%, -50% 71%, 50% -71%)",
          };
      }
    };

    const clipPaths = getPolygonClipPaths(start);

    return {
      name: `${variant}-${start}${blur ? "-blur" : ""}`,
      css: `
      ::view-transition-group(root) {
        animation-duration: 1.8s;
        animation-timing-function: var(--expo-out);
      }
            
      ::view-transition-new(root) {
        animation-name: reveal-light-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: none;
        z-index: -1;
      }
      .dark::view-transition-new(root) {
        animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
        from {
          clip-path: ${clipPaths.darkFrom};
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: ${clipPaths.darkTo};
          ${blur ? "filter: blur(0px);" : ""}
        }
      }

      @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
        from {
          clip-path: ${clipPaths.lightFrom};
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: ${clipPaths.lightTo};
          ${blur ? "filter: blur(0px);" : ""}
        }
      }
      `,
    };
  }

  // Handle circle variants with start positions using clip-path
  if (variant === "circle" && start !== "center") {
    const getClipPathPosition = (position: AnimationStart) => {
      switch (position) {
        case "top-left":
          return "0% 0%";
        case "top-right":
          return "100% 0%";
        case "bottom-left":
          return "0% 100%";
        case "bottom-right":
          return "100% 100%";
        case "top-center":
          return "50% 0%";
        case "bottom-center":
          return "50% 100%";
        default:
          return "50% 50%";
      }
    };

    const clipPosition = getClipPathPosition(start);

    return {
      name: `${variant}-${start}${blur ? "-blur" : ""}`,
      css: `
       ::view-transition-group(root) {
        animation-duration: 2.2s;
        animation-timing-function: var(--expo-out);
      }
            
      ::view-transition-new(root) {
        animation-name: reveal-light-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: none;
        z-index: -1;
      }
      .dark::view-transition-new(root) {
        animation-name: reveal-dark-${start}${blur ? "-blur" : ""};
        ${blur ? "filter: blur(2px);" : ""}
      }

      @keyframes reveal-dark-${start}${blur ? "-blur" : ""} {
        from {
          clip-path: circle(0% at ${clipPosition});
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: circle(150.0% at ${clipPosition});
          ${blur ? "filter: blur(0px);" : ""}
        }
      }

      @keyframes reveal-light-${start}${blur ? "-blur" : ""} {
        from {
           clip-path: circle(0% at ${clipPosition});
           ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          clip-path: circle(150.0% at ${clipPosition});
          ${blur ? "filter: blur(0px);" : ""}
        }
      }
      `,
    };
  }

  return {
    name: `${variant}-${start}${blur ? "-blur" : ""}`,
    css: `
      ::view-transition-group(root) {
        animation-timing-function: var(--expo-in);
      }
      ::view-transition-new(root) {
        mask: url('${svg}') ${start.replace("-", " ")} / 0 no-repeat;
        mask-origin: content-box;
        animation: scale-${start}${blur ? "-blur" : ""} 2.2s;
        transform-origin: ${transformOrigin};
        ${blur ? "filter: blur(2px);" : ""}
      }
      ::view-transition-old(root),
      .dark::view-transition-old(root) {
        animation: scale-${start}${blur ? "-blur" : ""} 2.2s;
        transform-origin: ${transformOrigin};
        z-index: -1;
      }
      @keyframes scale-${start}${blur ? "-blur" : ""} {
        from {
          ${blur ? "filter: blur(8px);" : ""}
        }
        ${blur ? "50% { filter: blur(4px); }" : ""}
        to {
          mask-size: 2000vmax;
          ${blur ? "filter: blur(0px);" : ""}
        }
      }
    `,
  };
};

export const useThemeToggle = ({
  variant = "circle",
  start = "center",
  blur = false,
  gifUrl = "",
}: {
  variant?: AnimationVariant;
  start?: AnimationStart;
  blur?: boolean;
  gifUrl?: string;
} = {}) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  // Sync isDark state with resolved theme after hydration
  useEffect(() => {
    setIsDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  const styleId = "theme-transition-styles";

  const updateStyles = useCallback((css: string, name: string) => {
    if (typeof window === "undefined") return;

    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      :root {
        --expo-in: cubic-bezier(0.95, 0.05, 0.795, 0.035);
        --expo-out: cubic-bezier(0.19, 1, 0.22, 1);
      }
      ${css}
    `;
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(!isDark);

    const animation = createAnimation(variant, start, blur, gifUrl);
    updateStyles(animation.css, animation.name);

    if (typeof window === "undefined") return;

    const switchTheme = () => {
      setTheme(theme === "light" ? "dark" : "light");
    };

    if (!(document as any).startViewTransition) {
      switchTheme();
      return;
    }

    (document as any).startViewTransition(switchTheme);
  }, [
    theme,
    setTheme,
    variant,
    start,
    blur,
    gifUrl,
    updateStyles,
    isDark,
  ]);

  const setCrazyLightTheme = useCallback(() => {
    setIsDark(false);

    const animation = createAnimation(variant, start, blur, gifUrl);
    updateStyles(animation.css, animation.name);

    if (typeof window === "undefined") return;

    const switchTheme = () => {
      setTheme("light");
    };

    if (!(document as any).startViewTransition) {
      switchTheme();
      return;
    }

    (document as any).startViewTransition(switchTheme);
  }, [setTheme, variant, start, blur, gifUrl, updateStyles]);

  const setCrazyDarkTheme = useCallback(() => {
    setIsDark(true);

    const animation = createAnimation(variant, start, blur, gifUrl);
    updateStyles(animation.css, animation.name);

    if (typeof window === "undefined") return;

    const switchTheme = () => {
      setTheme("dark");
    };

    if (!(document as any).startViewTransition) {
      switchTheme();
      return;
    }

    (document as any).startViewTransition(switchTheme);
  }, [setTheme, variant, start, blur, gifUrl, updateStyles]);

  const setCrazySystemTheme = useCallback(() => {
    if (typeof window === "undefined") return;

    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    setIsDark(prefersDark);

    const animation = createAnimation(variant, start, blur, gifUrl);
    updateStyles(animation.css, animation.name);

    const switchTheme = () => {
      setTheme("system");
    };

    if (!(document as any).startViewTransition) {
      switchTheme();
      return;
    }

    (document as any).startViewTransition(switchTheme);
  }, [setTheme, variant, start, blur, gifUrl, updateStyles]);

  return {
    isDark,
    setIsDark,
    toggleTheme,
    setCrazyLightTheme,
    setCrazyDarkTheme,
    setCrazySystemTheme,
  };
};

export const ThemeToggleButton = ({
  className = "",
  variant = "circle",
  start = "center",
  blur = false,
  gifUrl = "",
}: {
  className?: string;
  variant?: AnimationVariant;
  start?: AnimationStart;
  blur?: boolean;
  gifUrl?: string;
}) => {
  const { isDark, toggleTheme } = useThemeToggle({
    variant,
    start,
    blur,
    gifUrl,
  });

  return (
    <button
      type="button"
      className={cn(
        "size-10 cursor-pointer rounded-full bg-slate-900 dark:bg-slate-100 p-0 transition-all duration-300 active:scale-95 flex items-center justify-center border border-[var(--border)]",
        className,
      )}
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      <span className="sr-only">Toggle theme</span>
      <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
        <motion.g
          animate={{ rotate: isDark ? -180 : 0 }}
          transition={{ ease: "easeInOut", duration: 0.5 }}
        >
          <path
            d="M120 67.5C149.25 67.5 172.5 90.75 172.5 120C172.5 149.25 149.25 172.5 120 172.5"
            fill="currentColor"
            className="text-slate-100 dark:text-slate-900"
          />
          <path
            d="M120 67.5C90.75 67.5 67.5 90.75 67.5 120C67.5 149.25 90.75 172.5 120 172.5"
            fill="currentColor"
            className="text-slate-900 dark:text-slate-100"
          />
        </motion.g>
        <motion.path
          animate={{ rotate: isDark ? 180 : 0 }}
          transition={{ ease: "easeInOut", duration: 0.5 }}
          d="M120 3.75C55.5 3.75 3.75 55.5 3.75 120C3.75 184.5 55.5 236.25 120 236.25C184.5 236.25 236.25 184.5 236.25 120C236.25 55.5 184.5 3.75 120 3.75ZM120 214.5V172.5C90.75 172.5 67.5 149.25 67.5 120C67.5 90.75 90.75 67.5 120 67.5V25.5C172.5 25.5 214.5 67.5 214.5 120C214.5 172.5 172.5 214.5 120 214.5Z"
          fill="currentColor"
          className="text-slate-100 dark:text-slate-900"
        />
      </svg>
    </button>
  );
};

export const Options = ({
  variant,
  start,
  blur,
  gifType,
  gifUrl,
  setVariant,
  setStart,
  setBlur,
  setGifType,
  setGifUrl,
  onClose,
}: {
  variant: AnimationVariant;
  start: AnimationStart;
  blur: boolean;
  gifType: "1" | "2" | "3" | "custom";
  gifUrl: string;
  setVariant: (variant: AnimationVariant) => void;
  setStart: (start: AnimationStart) => void;
  setBlur: (blur: boolean) => void;
  setGifType: (type: "1" | "2" | "3" | "custom") => void;
  setGifUrl: (url: string) => void;
  onClose?: () => void;
}) => {
  return (
    <motion.div
      drag
      dragMomentum={false}
      className="fixed top-24 right-4 z-50 flex w-[265px] flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)]/90 p-4 shadow-xl backdrop-blur-md text-[var(--foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
        <span className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--foreground)]">
          <GripHorizontal className="size-4 opacity-70" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
          Transition Options
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs font-bold px-1.5 py-0.5 rounded hover:bg-[var(--card-hover)] cursor-pointer transition opacity-50 hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 text-xs">
        {/* Variant */}
        <div className="flex flex-col gap-1">
          <p className="font-medium text-[var(--text-muted)]">Variant:</p>
          <div className="flex flex-wrap gap-1">
            {(["circle", "rectangle", "gif", "polygon", "circle-blur"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setVariant(v);
                  // Set sensible defaults for starting positions when changing variants
                  if (v === "rectangle" && (start === "center" || start === "top-left" || start === "top-right" || start === "bottom-left" || start === "bottom-right")) {
                    setStart("bottom-up");
                  } else if ((v === "circle" || v === "circle-blur") && (start === "bottom-up" || start === "top-down" || start === "left-right" || start === "right-left")) {
                    setStart("center");
                  } else if (v === "polygon" && start !== "top-left" && start !== "top-right") {
                    setStart("top-left");
                  }
                }}
                className={cn(
                  "cursor-pointer rounded px-2 py-1 transition-colors text-[10px] font-mono",
                  variant === v
                    ? "bg-indigo-600 text-white"
                    : "bg-[var(--card-hover)] text-[var(--foreground)] hover:bg-indigo-600/20",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Blur */}
        <div className="flex items-center justify-between py-1 border-t border-[var(--border)]/50 pt-2">
          <p className="font-medium text-[var(--text-muted)]">Blur Effect:</p>
          <div className="flex gap-1">
            <button
              onClick={() => setBlur(false)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                !blur
                  ? "bg-indigo-600 text-white"
                  : "bg-[var(--card-hover)] text-[var(--foreground)]",
              )}
            >
              Off
            </button>
            <button
              onClick={() => setBlur(true)}
              className={cn(
                "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                blur
                  ? "bg-indigo-600 text-white"
                  : "bg-[var(--card-hover)] text-[var(--foreground)]",
              )}
            >
              On
            </button>
          </div>
        </div>

        {/* Start (conditional on variant) */}
        {(variant === "circle" ||
          variant === "rectangle" ||
          variant === "polygon" ||
          variant === "circle-blur") && (
          <div className="flex flex-col gap-1 border-t border-[var(--border)]/50 pt-2">
            <p className="font-medium text-[var(--text-muted)]">Start Position / Dir:</p>
            <div className="flex flex-wrap gap-1">
              {/* Show center option only for circle and circle-blur */}
              {(variant === "circle" || variant === "circle-blur") && (
                <button
                  onClick={() => setStart("center")}
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                    start === "center"
                      ? "bg-indigo-600 text-white"
                      : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                  )}
                >
                  center
                </button>
              )}

              {/* Show directional options for rectangle */}
              {variant === "rectangle" &&
                (["bottom-up", "top-down", "left-right", "right-left"] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setStart(dir)}
                    className={cn(
                      "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                      start === dir
                        ? "bg-indigo-600 text-white"
                        : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                    )}
                  >
                    {dir}
                  </button>
                ))}

              {/* Show corner options for circle, polygon, and circle-blur variants */}
              {(variant === "circle" ||
                variant === "polygon" ||
                variant === "circle-blur") && (
                <>
                  <button
                    onClick={() => setStart("top-left")}
                    className={cn(
                      "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                      start === "top-left"
                        ? "bg-indigo-600 text-white"
                        : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                    )}
                  >
                    top-left
                  </button>
                  <button
                    onClick={() => setStart("top-right")}
                    className={cn(
                      "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                      start === "top-right"
                        ? "bg-indigo-600 text-white"
                        : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                    )}
                  >
                    top-right
                  </button>
                  {/* Only show bottom corners for circle, not polygon */}
                  {variant !== "polygon" && (
                    <>
                      <button
                        onClick={() => setStart("bottom-left")}
                        className={cn(
                          "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                          start === "bottom-left"
                            ? "bg-indigo-600 text-white"
                            : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                        )}
                      >
                        bottom-left
                      </button>
                      <button
                        onClick={() => setStart("bottom-right")}
                        className={cn(
                          "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                          start === "bottom-right"
                            ? "bg-indigo-600 text-white"
                            : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                        )}
                      >
                        bottom-right
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Show center options for circle and circle-blur */}
              {(variant === "circle" || variant === "circle-blur") && (
                <>
                  <button
                    onClick={() => setStart("top-center")}
                    className={cn(
                      "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                      start === "top-center"
                        ? "bg-indigo-600 text-white"
                        : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                    )}
                  >
                    top-center
                  </button>
                  <button
                    onClick={() => setStart("bottom-center")}
                    className={cn(
                      "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                      start === "bottom-center"
                        ? "bg-indigo-600 text-white"
                        : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                    )}
                  >
                    bottom-center
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Show gif type options only for gif variant */}
        {variant === "gif" && (
          <div className="flex flex-col gap-1 border-t border-[var(--border)]/50 pt-2">
            <p className="font-medium text-[var(--text-muted)]">GIF Type:</p>
            <div className="flex flex-wrap gap-1">
              {[
                { type: "1", label: "GIF 1", url: "https://media.giphy.com/media/KBbr4hHl9DSahKvInO/giphy.gif?cid=790b76112m5eeeydoe7et0cr3j3ekb1erunxozyshuhxx2vl&ep=v1_stickers_search&rid=giphy.gif&ct=s" },
                { type: "2", label: "GIF 2", url: "https://media.giphy.com/media/5PncuvcXbBuIZcSiQo/giphy.gif?cid=ecf05e47j7vdjtytp3fu84rslaivdun4zvfhej6wlvl6qqsz&ep=v1_stickers_search&rid=giphy.gif&ct=s" },
                { type: "3", label: "GIF 3", url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3JwcXdzcHd5MW92NWprZXVpcTBtNXM5cG9obWh0N3I4NzFpaDE3byZlcD12MV9zdGlja2Vyc19zZWFyY2gmY3Q9cw/WgsVx6C4N8tjy/giphy.gif" },
                { type: "custom", label: "Custom", url: "" }
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => {
                    setGifType(item.type as any);
                    if (item.url) setGifUrl(item.url);
                  }}
                  className={cn(
                    "cursor-pointer rounded px-2 py-0.5 text-[10px]",
                    gifType === item.type
                      ? "bg-indigo-600 text-white"
                      : "bg-[var(--card-hover)] hover:bg-indigo-600/10",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom URL Input for GIF */}
        {variant === "gif" && gifType === "custom" && (
          <div className="flex flex-col gap-1 border-t border-[var(--border)]/50 pt-2">
            <p className="font-medium text-[var(--text-muted)]">Custom GIF URL:</p>
            <input
              type="text"
              value={gifUrl}
              onChange={(e) => setGifUrl(e.target.value)}
              placeholder="Enter GIF URL"
              className="w-full rounded border border-[var(--border)] bg-[var(--input-bg)] px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-600"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};
