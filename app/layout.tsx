import type { Metadata } from 'next';
import './globals.css';
import './liquid-glass.css';

export const metadata: Metadata = {
  title: 'RedDash — Redmine Dashboard',
  description: 'Log and visualize your Redmine time entries with an interactive calendar and team view.',
  authors: [{ name: 'Tieu Anh Quoc', url: 'https://tieuanhquoc.info/' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-hide-sidebar-brand="true" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Apply theme + liquid-glass before paint to avoid light/dark and
            frosted/non-frosted flashes. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='app.theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system')t='system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;document.documentElement.setAttribute('data-liquid-glass','off');}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
