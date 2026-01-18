// Balls‑Chin Generator script

// Grab DOM elements
const fileInput = document.getElementById('fileInput');
const intensitySlider = document.getElementById('intensity');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Preload mask and outline images for the Family Guy style chin.
const maskImg = new Image();
maskImg.src = 'mask_fg_chin.png';
const outlineImg = new Image();
outlineImg.src = 'outline_fg_chin.png';

// Additional sliders for width scaling and vertical offset
const widthFactorSlider = document.getElementById('widthFactor');
const offsetSlider = document.getElementById('offset');

// Global state
let uploadedImage = null;

// When a file is selected, load it into an Image object
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) {
    generateBtn.disabled = true;
    downloadBtn.disabled = true;
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImage = new Image();
    uploadedImage.onload = () => {
      // Resize canvas to match image dimensions
      canvas.width = uploadedImage.width;
      canvas.height = uploadedImage.height;
      // Draw the uploaded image onto the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(uploadedImage, 0, 0);
      // Enable generate button
      generateBtn.disabled = false;
      downloadBtn.disabled = true;
    };
    uploadedImage.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// Helper: compute average color of a region in the canvas
function computeAverageColor(x, y, w, h) {
  /**
   * Estimate an average skin tone from a rectangular sample of the underlying image.
   * Only consider pixels that are not too dark or too bright, and focus on the
   * upper portion of the bounding region to avoid clothing or background.
   */
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(canvas.width - sx, Math.floor(w));
  const sh = Math.min(canvas.height - sy, Math.floor(h * 0.4)); // sample only the top 40%
  if (sw <= 0 || sh <= 0) return { r: 220, g: 160, b: 140 };
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let rSum = 0,
    gSum = 0,
    bSum = 0,
    count = 0;
  for (let i = 0; i < data.length; i += 40) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    // Filter out very dark or very bright pixels to avoid hair, clothes, or highlights
    if (brightness > 40 && brightness < 230) {
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }
  }
  if (count === 0) return { r: 220, g: 160, b: 140 };
  const rAvg = rSum / count;
  const gAvg = gSum / count;
  const bAvg = bSum / count;
  // Slightly brighten the sampled colour to stand out from the face
  return {
    r: Math.min(255, Math.round(rAvg + 15)),
    g: Math.min(255, Math.round(gAvg + 15)),
    b: Math.min(255, Math.round(bAvg + 15)),
  };
}

// Helper: draw the balls‑chin overlay with dynamic fill colour
/**
 * Draw the cartoon chin using the preprocessed mask and outline. The mask defines
 * the shape of the chin (white) and the outline contains the black line art.
 * The tinted colour is applied via source-in compositing on an offscreen canvas.
 *
 * @param {number} x X coordinate on the main canvas
 * @param {number} y Y coordinate on the main canvas
 * @param {number} w Width of the chin on the main canvas
 * @param {number} h Height of the chin on the main canvas
 * @param {string} fillColor CSS colour string to tint the chin
 */
function drawTintedChin(x, y, w, h, fillColor) {
  // Ensure mask and outline are loaded
  if (!maskImg.complete || !outlineImg.complete || maskImg.naturalWidth === 0) {
    // Images not ready yet; skip drawing
    return;
  }
  // Create an offscreen canvas matching the mask dimensions
  const offCanvas = document.createElement('canvas');
  offCanvas.width = maskImg.width;
  offCanvas.height = maskImg.height;
  const offCtx = offCanvas.getContext('2d');
  // Draw mask (white shape) onto offscreen canvas
  offCtx.drawImage(maskImg, 0, 0);
  // Use source-in to fill only the shape with the tint colour
  offCtx.globalCompositeOperation = 'source-in';
  offCtx.fillStyle = fillColor;
  offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
  offCtx.globalCompositeOperation = 'source-over';
  // Draw the outline on top
  offCtx.drawImage(outlineImg, 0, 0);
  // Draw the offscreen canvas onto the main canvas with scaling
  ctx.drawImage(offCanvas, x, y, w, h);
}

// Fallback: when face detection fails, place overlay near the bottom centre
function drawFallback() {
  const intensity = parseFloat(intensitySlider.value);
  const widthFactor = parseFloat(widthFactorSlider.value);
  const verticalOffset = parseFloat(offsetSlider.value);
  const w = canvas.width * (0.3 + 0.2 * intensity) * widthFactor;
  const h = canvas.height * (0.15 + 0.1 * intensity);
  let x = canvas.width / 2 - w / 2;
  let y = canvas.height * 0.65;
  // Apply vertical offset relative to the image height
  y += verticalOffset * canvas.height;
  const { r, g, b } = computeAverageColor(x, y, w, h);
  const fill = `rgba(${r}, ${g}, ${b}, 1.0)`;
  drawTintedChin(x, y, w, h, fill);
}

// Click handler for the Generate button
generateBtn.addEventListener('click', async () => {
  if (!uploadedImage) return;
  // Disable buttons while processing
  generateBtn.disabled = true;
  downloadBtn.disabled = true;
  // Draw the original image first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(uploadedImage, 0, 0);
  // Intensity factor
  const intensity = parseFloat(intensitySlider.value);
  // Create FaceMesh instance
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  // Run face detection
  try {
    const results = await new Promise((resolve, reject) => {
      faceMesh.onResults(resolve);
      faceMesh.send({ image: uploadedImage });
    });
    const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
    if (!landmarks) {
      // No face detected: fallback
      drawFallback();
    } else {
      // Compute bounding box in pixel space
      const xs = landmarks.map((pt) => pt.x * uploadedImage.width);
      const ys = landmarks.map((pt) => pt.y * uploadedImage.height);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const faceW = maxX - minX;
      const faceH = maxY - minY;
      // Read adjustable factors
      const widthFactor = parseFloat(widthFactorSlider.value);
      const verticalOffset = parseFloat(offsetSlider.value);
      // Compute overlay dimensions based on face size, intensity and width factor
      const overlayW = faceW * (0.45 + 0.3 * intensity) * widthFactor;
      const overlayH = faceH * (0.25 + 0.15 * intensity);
      // Base X/Y position (centre under chin)
      let x = (minX + maxX) / 2 - overlayW / 2;
      let y = maxY - overlayH * 0.4;
      // Apply vertical offset relative to face height
      y += verticalOffset * faceH;
      // Compute average colour under overlay area to use as fill
      const { r, g, b } = computeAverageColor(x, y, overlayW, overlayH);
      const fill = `rgba(${r}, ${g}, ${b}, 1.0)`;
      // Compute face orientation angle using two eye landmarks (approx indices 33 and 263)
      let angle = 0;
      if (landmarks.length > 263) {
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const dx = (rightEye.x - leftEye.x) * uploadedImage.width;
        const dy = (rightEye.y - leftEye.y) * uploadedImage.height;
        angle = Math.atan2(dy, dx);
      }
      // Create offscreen tinted chin image
      if (!maskImg.complete || !outlineImg.complete || maskImg.naturalWidth === 0) {
        // Fallback: draw nothing if images aren't ready
      } else {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = maskImg.width;
        offCanvas.height = maskImg.height;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(maskImg, 0, 0);
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = fill;
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        offCtx.globalCompositeOperation = 'source-over';
        offCtx.drawImage(outlineImg, 0, 0);
        // Draw rotated onto main canvas
        const cx = x + overlayW / 2;
        const cy = y + overlayH / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.drawImage(offCanvas, -overlayW / 2, -overlayH / 2, overlayW, overlayH);
        ctx.restore();
      }
    }
  } catch (err) {
    console.error(err);
    drawFallback();
  }
  // Re‑enable buttons
  generateBtn.disabled = false;
  downloadBtn.disabled = false;
});

// Click handler for the Download button
downloadBtn.addEventListener('click', () => {
  if (!uploadedImage) return;
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'balls-chin.png';
  link.click();
});