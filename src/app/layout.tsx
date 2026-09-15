import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ELS Financial Planning | Manufacturing FP&A Platform',
  description:
    'Financial planning and analysis platform for manufacturing operations, budgeting, forecasting, and variance analysis.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
