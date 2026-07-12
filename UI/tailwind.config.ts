import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
    theme: {
        extend: {
            colors: {
                canvas: 'rgb(var(--canvas) / <alpha-value>)',
                surface: {
                    DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
                    hover: 'rgb(var(--surface-hover) / <alpha-value>)',
                    active: 'rgb(var(--surface-active) / <alpha-value>)',
                },
                hairline: {
                    DEFAULT: 'rgb(var(--line) / 0.09)',
                    strong: 'rgb(var(--line) / 0.14)',
                },
                fg: {
                    DEFAULT: 'rgb(var(--text) / 0.90)',
                    muted: 'rgb(var(--text) / 0.56)',
                    faint: 'rgb(var(--text) / 0.40)',
                },
                accent: {
                    DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
                    hover: 'rgb(var(--accent-hover) / <alpha-value>)',
                    soft: 'rgb(var(--accent-deep) / 0.22)',
                    fg: 'rgb(var(--accent-fg) / <alpha-value>)',
                },
                success: {
                    DEFAULT: 'rgb(var(--success) / <alpha-value>)',
                    soft: 'rgb(var(--success) / 0.14)',
                },
                danger: {
                    DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
                    soft: 'rgb(var(--danger) / 0.14)',
                },
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
                body: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
            transitionDuration: { DEFAULT: '200ms', 250: '250ms' },
            transitionTimingFunction: {
                DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
                'out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
            },
            boxShadow: {
                subtle: '0 1px 2px rgba(0, 0, 0, 0.20)',
                card: '0 1px 3px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)',
                overlay: '0 12px 48px rgba(0, 0, 0, 0.55)',
            },
        },
    },
    plugins: [],
};

export default config;
