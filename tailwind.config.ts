import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      // Radius scale from the design tokens (§17.2). Existing screens keep their
      // literal rounded-* classes; new components use these named steps.
      borderRadius: {
        control: 'var(--radius-control)', // 12px — inputs / buttons
        card: 'var(--radius-card)', // 16px — normal cards
        container: 'var(--radius-container)', // 24px — large work containers
      },
      minHeight: {
        control: 'var(--control-height)',
        touch: 'var(--control-height-touch)',
      },
      ringColor: {
        focus: 'var(--focus-ring)',
      },
    },
  },
  plugins: [],
}
export default config
