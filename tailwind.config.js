/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html'
  ],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-in-out',
        'slide-down': 'slideDown 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    }
  },
  plugins: [],
  safelist: [
    // Add service type color classes for dynamic styling
    'bg-blue-50', 'bg-blue-100', 'bg-blue-500', 'bg-blue-600', 'bg-blue-700',
    'text-blue-700', 'text-blue-800', 'border-blue-100', 'border-blue-200', 'border-blue-500',
    'bg-green-50', 'bg-green-100', 'bg-green-500', 'bg-green-600', 'bg-green-700',
    'text-green-700', 'text-green-800', 'border-green-100', 'border-green-200', 'border-green-500',
    'bg-purple-50', 'bg-purple-100', 'bg-purple-500', 'bg-purple-600', 'bg-purple-700',
    'text-purple-700', 'text-purple-800', 'border-purple-100', 'border-purple-200', 'border-purple-500',
    'bg-emerald-50', 'bg-emerald-100', 'border-emerald-100', 'border-emerald-200',
    'text-emerald-600', 'text-emerald-800',
    'bg-violet-50', 'bg-violet-100', 'border-violet-100', 'border-violet-200',
    'text-violet-600', 'text-violet-800',
    'animate-fade-in', 'animate-slide-up', 'animate-slide-down'
  ]
}
