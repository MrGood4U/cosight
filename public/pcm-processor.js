class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pending = []
    this.pendingLength = 0
    this.targetSampleRate = 16000
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel?.length) return true

    this.pending.push(channel.slice())
    this.pendingLength += channel.length

    if (this.pendingLength < 2048) return true

    const source = new Float32Array(this.pendingLength)
    let offset = 0
    for (const chunk of this.pending) {
      source.set(chunk, offset)
      offset += chunk.length
    }

    const ratio = sampleRate / this.targetSampleRate
    const outputLength = Math.floor(source.length / ratio)
    const output = new Int16Array(outputLength)
    for (let i = 0; i < outputLength; i += 1) {
      const sourceIndex = Math.min(Math.floor(i * ratio), source.length - 1)
      const sample = Math.max(-1, Math.min(1, source[sourceIndex]))
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }

    this.pending = []
    this.pendingLength = 0
    this.port.postMessage(output.buffer, [output.buffer])
    return true
  }
}

registerProcessor('cosight-pcm-processor', PcmProcessor)
