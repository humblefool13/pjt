import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
      <main className="flex flex-col items-center gap-8 text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          Smart Hybrid Safe Security System
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Advanced biometric security with real-time monitoring
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/safe"
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors"
          >
            Safe UI (Mobile)
          </Link>
          <Link
            href="/admin"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-colors"
          >
            Admin Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
