import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen bg-gray-100">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r p-5">
          <h1 className="text-xl font-bold mb-8">
            AI Study Planner
          </h1>

          <nav className="space-y-4">
            <Link
              href="/dashboard"
              className="block p-2 rounded hover:bg-gray-100"
            >
              📊 Dashboard
            </Link>

            <Link
              href="/chat"
              className="block p-2 rounded hover:bg-gray-100"
            >
              🤖 Study Chat
            </Link>

            <Link
              href="/planner"
              className="block p-2 rounded hover:bg-gray-100"
            >
              🗂 Planner
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
