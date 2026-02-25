/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ハチワレカラーパレット
        hachi: {
          blue: '#A2C2D0',       // くすみブルー
          'blue-light': '#C8DCE6',
          'blue-dark': '#7AAABB',
          pink: '#F2CBC9',       // くすみピンク
          'pink-light': '#F8E4E3',
          'pink-dark': '#E5A8A5',
          cream: '#FAF7F2',      // クリーム背景
          'cream-dark': '#F0EBE3',
          white: '#FFFFFF',
        },
        // ステータスカラー
        status: {
          doing: '#6BB8D4',      // Doing - ブルー
          'doing-bg': '#E8F4F9',
          review: '#B89FD4',     // Review - パープル
          'review-bg': '#F0EBF8',
          pause: '#D4B86B',      // Pause - イエロー
          'pause-bg': '#FBF5E6',
          waiting: '#9DB8A8',    // Waiting - グリーンみグレー
          'waiting-bg': '#EBF3EE',
          done: '#8FC8A4',       // Done - グリーン
          'done-bg': '#EAF6EF',
        }
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 2px 12px rgba(162, 194, 208, 0.25)',
        card: '0 4px 20px rgba(162, 194, 208, 0.20)',
        'card-hover': '0 6px 24px rgba(162, 194, 208, 0.35)',
      },
      animation: {
        'bounce-soft': 'bounce-soft 0.5s ease-in-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'pikupiku': 'pikupiku 0.55s ease-in-out',
      },
      keyframes: {
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', maxHeight: '0' },
          '100%': { opacity: '1', maxHeight: '1000px' },
        },
        'pikupiku': {
          '0%':   { transform: 'scaleY(1)' },
          '15%':  { transform: 'scaleY(1.25)' },
          '28%':  { transform: 'scaleY(1)' },
          '43%':  { transform: 'scaleY(1.18)' },
          '58%':  { transform: 'scaleY(1)' },
          '100%': { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
}
