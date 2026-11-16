import type { BrowserEvidenceFrame } from './review-browser';

const formats = [
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/mp4', extension: 'mp4' },
] as const;

export function reviewMotionVideoFormat() {
  if (typeof MediaRecorder !== 'function' || typeof MediaRecorder.isTypeSupported !== 'function' ||
      typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return;
  return formats.find(format => MediaRecorder.isTypeSupported(format.mimeType));
}

type MotionSample = Pick<BrowserEvidenceFrame, 'screenshot' | 'elapsedMs'>;
const waitForFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/** Encode the saved observations as held frames, with no synthesized in-between motion. */
export async function encodeReviewMotionVideo(samples: MotionSample[]) {
  const format = reviewMotionVideoFormat();
  if (!format) throw Error('Filmstrip video export is unavailable in this browser.');
  if (samples.length < 2 || samples.length > 6) throw Error('A filmstrip video needs two to six saved frames.');

  const images = await Promise.all(samples.map(async sample => {
    if (!sample.screenshot.startsWith('data:image/png;base64,')) throw Error('A saved PNG frame is unavailable.');
    const image = new Image();
    image.src = sample.screenshot;
    await image.decode();
    return image;
  }));
  const first = images[0];
  if (images.some(image => image.naturalWidth !== first.naturalWidth || image.naturalHeight !== first.naturalHeight)) {
    throw Error('Saved filmstrip frames must have matching dimensions.');
  }
  const scale = Math.min(1, 1920 / first.naturalWidth, 1080 / first.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.floor(first.naturalWidth * scale / 2) * 2);
  canvas.height = Math.max(2, Math.floor(first.naturalHeight * scale / 2) * 2);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none';
  // The recorder reads this canvas back every frame. GPU-backed drawImage
  // can leave the recorder with no frames in Edge.
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) throw Error('The browser could not draw the filmstrip.');

  const startTimes = [0];
  for (let index = 1; index < samples.length; index++) {
    const gap = (samples[index].elapsedMs ?? NaN) - (samples[index - 1].elapsedMs ?? NaN);
    startTimes.push(startTimes[index - 1] + (Number.isFinite(gap) && gap >= 0 ? Math.max(66, Math.min(1500, gap)) : 400));
  }
  const duration = startTimes.at(-1)! + 400;
  const draw = (image: HTMLImageElement) => context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const paintFrame = async (image: HTMLImageElement) => {
    if (document.hidden) throw Error('Keep Review visible while preparing the filmstrip.');
    draw(image);
    await waitForFrame();
  };
  draw(first);
  document.body.append(canvas);
  let stream: MediaStream | undefined;
  const record = async (stream: MediaStream, retrySlowStart: boolean) => {
    const recording = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 2_000_000 });
    const chunks: Blob[] = [];
    let started = false, timeout: ReturnType<typeof setTimeout> | undefined;
    const finished = new Promise<Blob>((resolve, reject) => {
      recording.addEventListener('start', () => { started = true; }, { once: true });
      recording.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recording.addEventListener('stop', () => resolve(new Blob(chunks, { type: recording.mimeType })), { once: true });
      recording.addEventListener('error', () => reject(Error('The browser could not encode the filmstrip video.')), { once: true });
      timeout = setTimeout(() => reject(Error('Filmstrip encoding timed out.')), duration + 4000);
    });
    const paint = async () => {
      const requestedAt = performance.now();
      // A cold encoder may take longer to start than the first sampled interval.
      while (!started && recording.state === 'recording') {
        await paintFrame(first);
      }
      if (recording.state !== 'recording') return false;
      if (retrySlowStart && performance.now() - requestedAt > 100) {
        // Discard the startup frames so the clip begins with the sampled timing.
        recording.stop();
        return true;
      }
      const start = performance.now();
      for (const [index, image] of images.entries()) {
        const deadline = Math.max(start + (startTimes[index + 1] ?? duration), performance.now() + 66);
        do {
          if (recording.state !== 'recording') return false;
          await paintFrame(image);
        } while (performance.now() < deadline);
      }
      if (recording.state === 'recording') recording.stop();
      return false;
    };
    try {
      recording.start(200);
      const [blob, retry] = await Promise.all([finished, paint()]);
      return { blob, retry };
    } finally {
      clearTimeout(timeout);
      if (recording.state !== 'inactive') recording.stop();
    }
  };
  try {
    stream = canvas.captureStream(30);
    const firstAttempt = await record(stream, true);
    const { blob } = firstAttempt.retry ? await record(stream, false) : firstAttempt;
    if (!blob.size) throw Error('The browser returned an empty filmstrip video.');
    return { blob, extension: format.extension };
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    canvas.remove();
  }
}
