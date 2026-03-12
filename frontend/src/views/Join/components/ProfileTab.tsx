import { useState, useEffect } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import api from '../../../api/client'
import toast from 'react-hot-toast'

export default function ProfileTab() {
  const { user, requestOtp, verifyOtp, logout } = useAuth()
  const [stats, setStats] = useState<{ performances: number; avgScore: number; bestScore: number } | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpStep, setOtpStep] = useState<'email' | 'otp'>('email')
  const [phone, setPhone] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [showPhone, setShowPhone] = useState(false)

  useEffect(() => {
    if (user) {
      api.get('/users/me/stats').then((r) => setStats(r.data)).catch(() => {})
    }
  }, [user?.id])

  const handleRequestOtp = async () => {
    try {
      await requestOtp(email)
      setOtpStep('otp')
    } catch {
      toast.error('Errore nell\'invio OTP')
    }
  }

  const handleVerifyOtp = async () => {
    try {
      await verifyOtp(email, otp)
      setShowRegister(false)
      setShowPhone(true)
      toast.success('Email verificata! 🎉')
    } catch {
      toast.error('OTP non valido')
    }
  }

  const handleLinkPhone = async () => {
    try {
      await api.post('/auth/link-phone', { phone, marketingOk: marketing })
      setShowPhone(false)
      toast.success('Telefono collegato!')
    } catch {
      toast.error('Errore')
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="card text-center">
        <div className="text-5xl mb-2">👤</div>
        <h2 className="text-xl font-bold">{user?.nickname}</h2>
        {user?.email && <p className="text-gray-400 text-sm">{user.email}</p>}
        <div className="flex justify-center gap-2 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            user?.role === 'user' ? 'bg-brand-500/20 text-brand-300' : 'bg-gray-500/20 text-gray-300'
          }`}>
            {user?.role === 'user' ? '✅ Registrato' : '👻 Ospite'}
          </span>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center">
            <div className="text-2xl font-bold text-brand-400">{stats.performances}</div>
            <div className="text-gray-400 text-xs">Esibizioni</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.avgScore.toFixed(1)}</div>
            <div className="text-gray-400 text-xs">Media</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-400">{stats.bestScore.toFixed(1)}</div>
            <div className="text-gray-400 text-xs">Record</div>
          </div>
        </div>
      )}

      {/* Register CTA for guests */}
      {user?.role === 'guest' && !showRegister && (
        <div className="card bg-brand-600/10 border-brand-500/30">
          <p className="text-brand-300 text-sm font-medium mb-1">💜 Salva i tuoi punteggi</p>
          <p className="text-gray-400 text-xs mb-3">Registrati per mantenere il tuo storico tra le serate</p>
          <button onClick={() => setShowRegister(true)} className="btn-primary w-full text-sm">
            Registrati gratis
          </button>
        </div>
      )}

      {showRegister && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Registrazione</h3>
          {otpStep === 'email' ? (
            <>
              <input className="input" type="email" placeholder="La tua email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button onClick={handleRequestOtp} disabled={!email.trim()} className="btn-primary w-full">
                Invia codice
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-sm">Codice inviato a {email}</p>
              <input className="input text-center tracking-widest text-xl" placeholder="000000" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} />
              <button onClick={handleVerifyOtp} disabled={otp.length !== 6} className="btn-primary w-full">
                Verifica
              </button>
              <button onClick={() => setOtpStep('email')} className="text-gray-500 text-xs">← Usa altra email</button>
            </>
          )}
        </div>
      )}

      {showPhone && (
        <div className="card space-y-3">
          <h3 className="font-semibold">Telefono (opzionale)</h3>
          <input className="input" type="tel" placeholder="+39 123 456 7890" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5" />
            <span className="text-gray-300">
              Acconsento a ricevere comunicazioni promozionali via SMS (GDPR)
            </span>
          </label>
          <div className="flex gap-2">
            <button onClick={handleLinkPhone} disabled={!phone.trim()} className="btn-primary flex-1 text-sm">Salva</button>
            <button onClick={() => setShowPhone(false)} className="btn-secondary flex-1 text-sm">Salta</button>
          </div>
        </div>
      )}

      <button onClick={logout} className="btn-secondary w-full text-sm">
        Esci dalla serata
      </button>
    </div>
  )
}
