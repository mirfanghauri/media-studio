export const OUTPUT_FORMATS = [
  { value: 'png',  label: 'PNG',  description: 'Lossless, best quality',               icon: '🖼️' },
  { value: 'jpg',  label: 'JPG',  description: 'Smaller files, great for photos',       icon: '📷' },
  { value: 'webp', label: 'WEBP', description: 'Modern format, excellent compression',   icon: '⚡' },
  { value: 'avif', label: 'AVIF', description: 'Next-gen, smallest file size',           icon: '🚀' },
];

export const QUALITY_OPTIONS = [
  { value: 'low',    label: 'Low',    description: 'Faster generation, lower detail' },
  { value: 'medium', label: 'Medium', description: 'Balanced speed and quality' },
  { value: 'high',   label: 'High',   description: 'Best quality, slower generation' },
];
