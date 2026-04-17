@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", Arial, Helvetica, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  /* Gazprom Brand Colors */
  --color-gaz-blue-900: #003a8f;
  --color-gaz-blue-700: #005EB8;
  --color-gaz-blue-500: #3a7bd5;
  --color-gaz-blue-300: #8fb6e6;
  
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f7fa;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #6b7280;
  --color-border-primary: #d1d5db;
  --color-border-secondary: #e5e7eb;
}

@layer base {
  body {
    @apply bg-[--color-bg-secondary] text-[--color-text-primary] font-sans antialiased;
  }
  
  h1, h2, h3, h4, h5, h6 {
    @apply text-[--color-gaz-blue-900] font-bold;
  }
}
