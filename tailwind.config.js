import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: ["./newtab.html", "./options.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "secondary-background": "var(--secondary-background)",
        foreground: "var(--foreground)",
        "main-foreground": "var(--main-foreground)",
        main: "var(--main)",
        border: "var(--border)",
        ring: "var(--ring)",
        overlay: "var(--overlay)"
      },
      borderRadius: {
        base: "var(--border-radius)",
        lg: "var(--border-radius)",
        md: "calc(var(--border-radius) - 2px)",
        sm: "calc(var(--border-radius) - 4px)"
      },
      boxShadow: {
        shadow: "var(--shadow)",
        nav: "4px 4px 0px 0px var(--border)",
        navDark: "4px 4px 0px 0px var(--border)"
      },
      spacing: {
        boxShadowX: "var(--box-shadow-x)",
        boxShadowY: "var(--box-shadow-y)",
        reverseBoxShadowX: "var(--reverse-box-shadow-x)",
        reverseBoxShadowY: "var(--reverse-box-shadow-y)"
      },
      fontWeight: {
        base: "var(--base-font-weight)",
        heading: "var(--heading-font-weight)"
      },
      fontFamily: {
        heading: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        base: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
