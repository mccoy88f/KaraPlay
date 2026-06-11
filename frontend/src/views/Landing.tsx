import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <div className="text-8xl mb-4">🎤</div>
        <h1 className="text-5xl font-bold text-brand-400">KaraokeGame</h1>
        <p className="text-gray-400 mt-2 text-lg">Serate karaoke gamificate</p>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        <Link to="/join" className="card text-center hover:border-brand-500 transition-colors cursor-pointer">
          <div className="text-3xl mb-2">📱</div>
          <div className="font-semibold">Partecipa</div>
          <div className="text-gray-400 text-sm">/join</div>
        </Link>
        <Link to="/display" className="card text-center hover:border-brand-500 transition-colors cursor-pointer">
          <div className="text-3xl mb-2">📺</div>
          <div className="font-semibold">Schermo</div>
          <div className="text-gray-400 text-sm">/display</div>
        </Link>
        <Link to="/admin" className="card text-center hover:border-brand-500 transition-colors cursor-pointer">
          <div className="text-3xl mb-2">🎛️</div>
          <div className="font-semibold">Admin</div>
          <div className="text-gray-400 text-sm">/admin</div>
        </Link>
        <Link to="/stage" className="card text-center hover:border-brand-500 transition-colors cursor-pointer">
          <div className="text-3xl mb-2">🎵</div>
          <div className="font-semibold">Palco</div>
          <div className="text-gray-400 text-sm">/stage</div>
        </Link>
      </div>
    </div>
  )
}
