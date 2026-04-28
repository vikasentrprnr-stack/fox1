export const createAudioWorkletNode = async (audioContext: AudioContext) => {
  const workletCode = `
    class PCMProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
      }

      process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
          const channelData = input[0];
          for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bytesWritten++] = channelData[i];
            if (this.bytesWritten >= this.bufferSize) {
              this.port.postMessage(this.buffer);
              this.buffer = new Float32Array(this.bufferSize);
              this.bytesWritten = 0;
            }
          }
        }
        return true;
      }
    }
    registerProcessor('pcm-processor', PCMProcessor);
  `;
  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await audioContext.audioWorklet.addModule(url);
  return new AudioWorkletNode(audioContext, 'pcm-processor');
};

export const float32ToInt16 = (buffer: Float32Array) => {
  let l = buffer.length;
  const buf = new Int16Array(l);
  while (l--) {
    let s = Math.max(-1, Math.min(1, buffer[l]));
    buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return buf;
};

export const int16ToBase64 = (int16Array: Int16Array) => {
  const bytes = new Uint8Array(int16Array.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToFloat32 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 0x8000;
  }
  return float32Array;
};
