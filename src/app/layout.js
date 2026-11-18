import '@/styles/globals.css';
import { AppShell } from '@/components/layout/AppShell.js';

export const metadata = {
  title: 'GENESIS — Software Requirement Traceability & Verification Framework',
  description:
    'An Evidence-Grounded AI Framework for Software Requirement Traceability and Implementation Verification.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

