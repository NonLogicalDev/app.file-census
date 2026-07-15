/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'surface-subtle': 'var(--surface-subtle)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        'muted-strong': 'var(--muted-strong)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-line': 'var(--accent-line)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
        warning: 'var(--warning)',
        'warning-soft': 'var(--warning-soft)',
        sidebar: {
          bg: 'var(--sidebar-bg)',
          surface: 'var(--sidebar-surface)',
          hover: 'var(--sidebar-surface-hover)',
          border: 'var(--sidebar-border)',
          text: 'var(--sidebar-text)',
          muted: 'var(--sidebar-muted)',
          active: 'var(--sidebar-active)'
        }
      },
      borderRadius: {
        ui: '6px',
        panel: '8px'
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)'
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
