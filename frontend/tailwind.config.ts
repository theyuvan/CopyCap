import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        panel: "var(--panel)",
        "panel-hover": "var(--panel-hover)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--text)",
        muted: "var(--muted)",
        "muted-dim": "var(--muted-dim)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        info: "var(--info)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
        accent: ["var(--font-accent-serif)", "serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      maxWidth: {
        content: "1500px",
      },
      boxShadow: {
        glow: "0 0 60px -15px var(--accent-glow)",
        "glow-success": "0 0 60px -15px var(--success-glow)",
        "glow-danger": "0 0 60px -15px var(--danger-glow)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
