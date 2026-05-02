import React, { useRef, useCallback, useState, useEffect } from 'react'

interface SignatureCanvasProps {
  onSave: (base64: string) => void
  onCancel?: () => void
  width?: number
  height?: number
  lineColor?: string
  bgColor?: string
  initialData?: string
}

const SignatureCanvas: React.FC<SignatureCanvasProps> = React.memo(({
  onSave,
  onCancel,
  width = 400,
  height = 200,
  lineColor = '#e2e8f0',
  bgColor = '#0f172a',
  initialData,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(width)
  const isDrawing = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.min(entry.contentRect.width, width)
        setContainerWidth(Math.floor(w))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = containerWidth
    canvas.height = height

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, containerWidth, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2
    ctx.strokeStyle = lineColor

    if (initialData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, containerWidth, height)
      img.src = initialData
    }
  }, [containerWidth, height, bgColor, lineColor, initialData])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = (e as React.MouseEvent).clientX
      clientY = (e as React.MouseEvent).clientY
    }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true
    const { x, y } = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [getPos])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return
    const { x, y } = getPos(e)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineTo(x, y)
    ctx.stroke()
  }, [getPos])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.closePath()
  }, [])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [bgColor])

  const save = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }, [onSave])

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: width }}>
      <canvas
        ref={canvasRef}
        style={{
          width: containerWidth,
          height,
          borderRadius: 8,
          border: `1px solid #1a3a5c`,
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block',
        }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={(e) => { e.preventDefault(); startDrawing(e) }}
        onTouchMove={(e) => { e.preventDefault(); draw(e) }}
        onTouchEnd={(e) => { e.preventDefault(); stopDrawing() }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'flex-end' }}>
        {onCancel && (
          <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #1a3a5c', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
            Отмена
          </button>
        )}
        <button onClick={clear} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #1a3a5c', background: '#0d1f30', color: '#e2e8f0', fontSize: 13, cursor: 'pointer' }}>
          Очистить
        </button>
        <button onClick={save} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1a7dbd', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          Сохранить
        </button>
      </div>
    </div>
  )
})

SignatureCanvas.displayName = 'SignatureCanvas'

export default SignatureCanvas
