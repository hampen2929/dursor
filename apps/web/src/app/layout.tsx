import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'dursor - Multi-model Coding Agent',
  description: 'BYO API Key / Multi-model parallel execution / Conversation-driven PR development',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-white">
              dursor
            </a>
            <div className="flex items-center gap-4">
              <a
                href="/settings"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Settings
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
