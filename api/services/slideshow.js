"use strict";

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".gif"]);

function validateImage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

// Maps our API transition names to FFmpeg xfade names
const TRANSITION_MAP = {
  fade: "fade",
  slide: "slideleft",
  wipe: "wipeleft",
  push: "smoothleft",
  zoom: "zoomin",
  pixelate: "pixelize"
};

function createSlideshow(jobId, imagePaths, options, storagePath) {
  return new Promise((resolve, reject) => {
    let { slideDuration = 3, transition = 'fade', resolution = '1280:720', textOverlay, musicPath } = options;
    const videoJobDir = path.join(storagePath, "videos", jobId);
    fs.mkdirSync(videoJobDir, { recursive: true });
    const outPath = path.join(videoJobDir, "slideshow.mp4");
    const flatOutPath = path.join(storagePath, "videos", `${jobId}_slideshow.mp4`);

    const fps = 30;
    slideDuration = Number(slideDuration);
    
    // Transition duration is fixed at 1 second, or half the slide duration if slide is very short
    const transitionDuration = Math.min(1, slideDuration / 2);
    const totalDuration = Math.max(0.5, imagePaths.length * slideDuration);

    const args = ['-y'];
    
    // Add all images as inputs with full duration so xfade never starves for frames
    imagePaths.forEach(img => {
      args.push('-loop', '1');
      args.push('-t', totalDuration.toFixed(2));
      args.push('-i', img);
    });

    if (musicPath) {
      args.push('-i', musicPath);
    }

    let filtergraph = "";
    
    // Step 1: Scale/Pad or ZoomPan each input to ensure identical resolution and format
    const [resW, resH] = resolution.split(':');
    
    for (let i = 0; i < imagePaths.length; i++) {
      if (transition === 'pan_zoom') {
        const slideFrames = Math.ceil((slideDuration + transitionDuration) * fps);
        filtergraph += `[${i}:v]scale=${resW}:${resH}:force_original_aspect_ratio=increase,crop=${resW}:${resH},zoompan=z='min(zoom+0.0015,1.5)':d=${slideFrames}:s=${resW}x${resH}:fps=${fps},format=yuv420p[v${i}];`;
      } else {
        // Standard scale and pad
        filtergraph += `[${i}:v]scale=${resW}:${resH}:force_original_aspect_ratio=decrease,pad=${resW}:${resH}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}];`;
      }
    }

    // Step 2: Apply transitions if needed
    let lastOut = `[v0]`;
    
    if (transition === 'cut' || transition === 'none') {
      // Concat without transitions
      let concatInputs = "";
      for (let i = 0; i < imagePaths.length; i++) {
        concatInputs += `[v${i}]`;
      }
      filtergraph += `${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[outv]`;
      lastOut = `[outv]`;
    } else {
      // Apply xfade transitions
      // If transition is pan_zoom, we use crossfade ('fade') between the zooming images
      const xfadeName = transition === 'pan_zoom' ? 'fade' : (TRANSITION_MAP[transition] || 'fade');
      
      let prevNode = `v0`;
      for (let i = 1; i < imagePaths.length; i++) {
        const offset = i * slideDuration;
        const outNode = i === imagePaths.length - 1 ? `outv` : `xf${i}`;
        filtergraph += `[${prevNode}][v${i}]xfade=transition=${xfadeName}:duration=${transitionDuration}:offset=${offset}[${outNode}];`;
        prevNode = outNode;
      }
      if (imagePaths.length > 1) {
        // If there's only 1 image, it just uses [v0]. Filtergraph would end in a trailing semicolon.
        lastOut = `[outv]`;
      }
    }

    // Remove trailing semicolon if there was only 1 image and no concat/xfade was added
    if (filtergraph.endsWith(';')) {
      filtergraph = filtergraph.slice(0, -1);
    }

    // Step 3: Text Overlay
    if (textOverlay) {
       const safeText = textOverlay.replace(/'/g, "\\'").replace(/:/g, "\\:");
       const textFilter = `drawtext=text='${safeText}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10`;
       if (imagePaths.length === 1 && transition !== 'cut' && transition !== 'none') {
         // No outv was generated
         filtergraph += `[v0]${textFilter}[outv]`;
       } else {
         filtergraph += `;${lastOut}${textFilter}[outv]`;
       }
       lastOut = `[outv]`;
    } else if (imagePaths.length === 1 && transition !== 'cut' && transition !== 'none') {
       // Just map v0 to outv
       filtergraph += `[v0]copy[outv]`;
       lastOut = `[outv]`;
    }

    args.push('-filter_complex', filtergraph);
    args.push('-map', lastOut);

    if (musicPath) {
       args.push('-map', `${imagePaths.length}:a`);
       args.push('-c:a', 'aac');
       const fadeDuration = Math.min(1.5, Math.max(0.5, totalDuration / 3));
       const fadeStart = Math.max(0, totalDuration - fadeDuration);
       args.push('-af', `afade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeDuration.toFixed(2)}`);
       args.push('-shortest');
    }

    args.push('-c:v', 'libx264');
    args.push('-r', fps.toString());
    args.push('-pix_fmt', 'yuv420p');
    args.push('-t', totalDuration.toFixed(2));
    args.push(outPath);

    const ffmpeg = spawn('ffmpeg', args);
    let errorLog = '';

    ffmpeg.stderr.on('data', (data) => {
      errorLog += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        try {
          fs.copyFileSync(outPath, flatOutPath);
        } catch (_) {}
        resolve(outPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${errorLog}`));
      }
    });
  });
}

module.exports = {
  ALLOWED_IMAGE_EXTENSIONS,
  validateImage,
  createSlideshow
};
