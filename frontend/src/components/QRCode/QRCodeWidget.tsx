import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

interface Props {
  value: string
  size?: number
}

export default function QRCodeWidget({ value, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      color: { dark: '#e2e8f0', light: '#1a1a2e' },
    })
  }, [value, size])

  return <canvas ref={canvasRef} />
}
