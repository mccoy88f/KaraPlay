import { useRef, useState, useCallback } from 'react'
import * as Tone from 'tone'
import { Midi } from '@tonejs/midi'
import { getSocket } from './useSocket'

interface LrcLine {
  time: number
  text: string
  words?: Array<{ time: number; text: string }>
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  const lineRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/
  for (const line of lrc.split('\n')) {
    const match = line.match(lineRegex)
    if (!match) continue
    const min = parseInt(match[1])
    const sec = parseInt(match[2])
    const ms = parseInt(match[3].padEnd(3, '0'))
    const time = min * 60 + sec + ms / 1000
    const text = match[4].trim()

    // Parse word-level timestamps
    const wordRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>([^<]*)/g
    const words: Array<{ time: number; text: string }> = []
    let m
    while ((m = wordRegex.exec(text)) !== null) {
      const wTime = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3].padEnd(3, '0')) / 1000
      words.push({ time: wTime, text: m[4] })
    }

    lines.push({ time, text: text.replace(/<[^>]+>/g, ''), words: words.length > 0 ? words : undefined })
  }
  return lines.sort((a, b) => a.time - b.time)
}

export function useKaraokePlayer(eventId?: string) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentLineIndex, setCurrentLineIndex] = useState(-1)
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([])
  const lrcLinesRef = useRef<LrcLine[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animFrameRef = useRef<number>()
  const midiPartRef = useRef<Tone.Part | null>(null)
  const samplerRef = useRef<Tone.Sampler | null>(null)
  const sourceTypeRef = useRef<'midi' | 'youtube'>('midi')

  const loadLrc = useCallback((lrcText: string) => {
    const lines = parseLrc(lrcText)
    setLrcLines(lines)
    lrcLinesRef.current = lines
  }, [])

  const updateLyricSync = useCallback(() => {
    const time = sourceTypeRef.current === 'midi'
      ? Tone.Transport.seconds
      : (audioRef.current?.currentTime || 0)

    setCurrentTime(time)

    const lines = lrcLinesRef.current
    let lineIdx = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (time >= lines[i].time) { lineIdx = i; break }
    }
    setCurrentLineIndex(lineIdx)

    if (lineIdx >= 0 && lines[lineIdx].words) {
      const words = lines[lineIdx].words!
      let wordIdx = -1
      for (let i = words.length - 1; i >= 0; i--) {
        if (time >= words[i].time) { wordIdx = i; break }
      }
      setCurrentWordIndex(wordIdx)

      const socket = getSocket()
      if (socket && eventId) {
        socket.emit('lyric:highlight', { wordIndex: wordIdx, lineIndex: lineIdx, text: lines[lineIdx].text })
      }
    }

    animFrameRef.current = requestAnimationFrame(updateLyricSync)
  }, [eventId])

  const loadMidi = useCallback(async (midiUrl: string, lrcText?: string) => {
    sourceTypeRef.current = 'midi'
    if (lrcText) loadLrc(lrcText)

    const response = await fetch(midiUrl)
    const arrayBuffer = await response.arrayBuffer()
    const midi = new Midi(arrayBuffer)

    await Tone.start()
    Tone.Transport.stop()
    Tone.Transport.cancel()

    if (samplerRef.current) samplerRef.current.dispose()

    // Load GM soundfont for piano (instrument 0)
    const sampler = new Tone.Sampler({
      urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3' },
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      onload: () => {
        const notes: Array<{ time: number; note: string; duration: number; velocity: number }> = []
        midi.tracks.forEach((track) => {
          track.notes.forEach((note) => {
            notes.push({ time: note.time, note: note.name, duration: note.duration, velocity: note.velocity })
          })
        })

        const part = new Tone.Part((time, note) => {
          sampler.triggerAttackRelease(note.note, note.duration, time, note.velocity)
        }, notes)

        part.start(0)
        midiPartRef.current = part
        setDuration(midi.duration)
      },
    }).toDestination()
    samplerRef.current = sampler
  }, [loadLrc])

  const loadYoutube = useCallback((audioUrl: string, lrcText?: string) => {
    sourceTypeRef.current = 'youtube'
    if (lrcText) loadLrc(lrcText)
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    audioRef.current.src = audioUrl
    audioRef.current.onloadedmetadata = () => {
      setDuration(audioRef.current?.duration || 0)
    }
  }, [loadLrc])

  const play = useCallback(async () => {
    if (sourceTypeRef.current === 'midi') {
      await Tone.start()
      Tone.Transport.start()
    } else {
      await audioRef.current?.play()
    }
    setIsPlaying(true)
    animFrameRef.current = requestAnimationFrame(updateLyricSync)
  }, [updateLyricSync])

  const pause = useCallback(() => {
    if (sourceTypeRef.current === 'midi') {
      Tone.Transport.pause()
    } else {
      audioRef.current?.pause()
    }
    setIsPlaying(false)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
  }, [])

  const stop = useCallback(() => {
    if (sourceTypeRef.current === 'midi') {
      Tone.Transport.stop()
      Tone.Transport.cancel()
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
    }
    setIsPlaying(false)
    setCurrentTime(0)
    setCurrentLineIndex(-1)
    setCurrentWordIndex(-1)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
  }, [])

  return {
    isPlaying, currentTime, duration, currentLineIndex, currentWordIndex, lrcLines,
    loadMidi, loadYoutube, loadLrc, play, pause, stop, audioRef,
  }
}
