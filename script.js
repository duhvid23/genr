// Balls‑Chin Generator script

// Grab DOM elements
const fileInput = document.getElementById('fileInput');
const intensitySlider = document.getElementById('intensity');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

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
  // Clamp region within canvas bounds
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.min(canvas.width - sx, Math.floor(w));
  const sh = Math.min(canvas.height - sy, Math.floor(h));
  if (sw <= 0 || sh <= 0) return { r: 200, g: 160, b: 140 };
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let r = 0,
    g = 0,
    b = 0,
    count = 0;
  // Sample every 10th pixel to speed up
  for (let i = 0; i < data.length; i += 40) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  if (count === 0) return { r: 200, g: 160, b: 140 };
  return {
    r: Math.min(255, Math.round(r / count + 10)),
    g: Math.min(255, Math.round(g / count + 10)),
    b: Math.min(255, Math.round(b / count + 10)),
  };
}

// Helper: draw the balls‑chin overlay with dynamic fill colour
function drawBallsChin(x, y, w, h, fillColor, outlineColor) {
  // Save context state
  ctx.save();
  // Left ellipse
  ctx.beginPath();
  ctx.ellipse(
    x + w * 0.25,
    y + h * 0.6,
    w * 0.25,
    h * 0.4,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  // Right ellipse
  ctx.beginPath();
  ctx.ellipse(
    x + w * 0.75,
    y + h * 0.6,
    w * 0.25,
    h * 0.4,
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  // Draw central valley line
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h * 0.35);
  ctx.lineTo(x + w / 2, y + h * 0.8);
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  // Top connecting arc for a smooth valley join
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.35, w * 0.25, Math.PI, 0, false);
  ctx.lineWidth = 2;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
  // Restore state
  ctx.restore();
}

// Fallback: when face detection fails, place overlay near the bottom centre
function drawFallback() {
  const intensity = parseFloat(intensitySlider.value);
  const w = canvas.width * (0.3 + 0.2 * intensity);
  const h = canvas.height * (0.15 + 0.1 * intensity);
  const x = canvas.width / 2 - w / 2;
  const y = canvas.height * 0.65;
  const { r, g, b } = computeAverageColor(x, y, w, h);
  const fill = `rgba(${r}, ${g}, ${b}, 1.0)`;
  const outline = 'rgba(0,0,0,1.0)';
  drawBallsChin(x, y, w, h, fill, outline);
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
      // Compute overlay dimensions based on face size and intensity
      const overlayW = faceW * (0.45 + 0.3 * intensity);
      const overlayH = faceH * (0.25 + 0.15 * intensity);
      const x = (minX + maxX) / 2 - overlayW / 2;
      const y = maxY - overlayH * 0.4;
      // Compute average colour under overlay area to use as fill
      const { r, g, b } = computeAverageColor(x, y, overlayW, overlayH);
      const fill = `rgba(${r}, ${g}, ${b}, 1.0)`;
      const outline = 'rgba(0,0,0,1.0)';
      drawBallsChin(x, y, overlayW, overlayH, fill, outline);
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