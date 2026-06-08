import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RedDash — Redmine Dashboard',
  description: 'Log and visualize your Redmine time entries with an interactive calendar and team view.',
  authors: [{ name: 'Tieu Anh Quoc', url: 'https://tieuanhquoc.info/' }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
