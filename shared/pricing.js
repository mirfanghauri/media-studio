"use strict";

/**
 * Pricing rates per 1 Million tokens or per image.
 * All prices in USD.
 */
const PRICING_RATES = {
  openai: {
    // Per 1M tokens
    image_input: 8.00,
    cached_image_input: 2.00,
    text_input: 5.00,
    cached_text_input: 1.25,
    image_output: 30.00,
    batch_discount: 0.50, // 50% discount for Batch API
  },
  azure: {
    // Azure OpenAI GPT-Image-2 matches OpenAI rates
    image_input: 8.00,
    cached_image_input: 2.00,
    text_input: 5.00,
    cached_text_input: 1.25,
    image_output: 30.00,
    batch_discount: 1.0, // standard
  },
  vertex: {
    // Imagen 3 tiered flat per image
    "imagen-3.0-generate-002": { per_image: 0.060, edit_per_image: 0.020 },
    "imagen-3.0-fast-generate-001": { per_image: 0.020, edit_per_image: 0.020 },
    "imagen-3.0-capability-001": { per_image: 0.060, edit_per_image: 0.020 },
    // Gemini Image generation by resolution
    "gemini-3.1-flash-image": {
      "512": 0.045,
      "1024": 0.067,
      "2048": 0.101,
      "4096": 0.151,
      default: 0.067,
      ref_image_token_cost: 0.0011, // 560 tokens for reference image
    },
    "gemini-3-pro-image": {
      "1024": 0.134,
      "2048": 0.134,
      "4096": 0.240,
      default: 0.134,
      ref_image_token_cost: 0.0011,
    },
  },
  xai: {
    "grok-imagine-image-2.0": 0.040,
    "grok-imagine-image-quality": 0.050,
    "grok-imagine-image": 0.020,
    default: 0.040,
  },
};

/**
 * Calculates image generation/edit cost and normalized token usage.
 *
 * @param {object} params
 * @param {string} params.provider Provider name ('openai', 'azure', 'vertex')
 * @param {string} params.model Model identifier
 * @param {object} [params.usage] Usage metadata returned from API
 * @param {string} [params.dimensions] Resolution string like '1024x1024'
 * @param {'realtime'|'batch'} [params.processingMode] 'realtime' or 'batch'
 * @param {'generate'|'edit'} [params.operationType] 'generate' or 'edit'
 * @param {string} [params.quality] 'medium' or 'high'
 * @param {number} [params.imageCount] Number of generated images (default: 1)
 * @returns {object} { totalCost, totalTokens, usageDetails, costBreakdown, currency: 'USD' }
 */
function calculateImageCost({
  provider = "openai",
  model = "gpt-image-2",
  usage = null,
  dimensions = "1024x1024",
  processingMode = "realtime",
  operationType = "edit",
  quality = "medium",
  imageCount = 1,
}) {
  const normProvider = (provider || "openai").toLowerCase();
  const isBatch = processingMode === "batch";
  const count = Math.max(1, parseInt(imageCount, 10) || 1);

  if (operationType === "convert" || normProvider === "none" || normProvider === "local") {
    return {
      totalCost: 0,
      totalTokens: 0,
      usageDetails: null,
      costBreakdown: {},
      currency: "USD",
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. OPENAI & AZURE OPENAI (Token-Based Billing)
  // ───────────────────────────────────────────────────────────────────────────
  if (normProvider === "openai" || normProvider === "azure") {
    const rates = normProvider === "azure" ? PRICING_RATES.azure : PRICING_RATES.openai;

    let inputTokens = 0;
    let imageInputTokens = 0;
    let textInputTokens = 0;
    let outputTokens = 0;
    let imageOutputTokens = 0;
    let textOutputTokens = 0;
    let totalTokens = 0;

    if (usage) {
      inputTokens = usage.input_tokens || 0;
      outputTokens = usage.output_tokens || 0;
      totalTokens = usage.total_tokens || (inputTokens + outputTokens);

      const inDetails = usage.input_tokens_details || {};
      const outDetails = usage.output_tokens_details || {};

      imageInputTokens = inDetails.image_tokens ?? (operationType === "edit" ? Math.round(inputTokens * 0.65) : 0);
      textInputTokens = inDetails.text_tokens ?? (inputTokens - imageInputTokens);

      imageOutputTokens = outDetails.image_tokens ?? outputTokens;
      textOutputTokens = outDetails.text_tokens ?? 0;
    } else {
      // Estimated tokens if provider didn't return usage block
      const [w, h] = (dimensions || "1024x1024").split("x").map(Number);
      const isLarge = (w && h && w * h > 1024 * 1024);
      imageOutputTokens = (isLarge ? 1630 : 1120) * count;
      textInputTokens = 350;
      imageInputTokens = operationType === "edit" ? 736 : 0;
      inputTokens = textInputTokens + imageInputTokens;
      outputTokens = imageOutputTokens;
      totalTokens = inputTokens + outputTokens;
    }

    const inputCostImage = (imageInputTokens / 1_000_000) * rates.image_input;
    const inputCostText = (textInputTokens / 1_000_000) * rates.text_input;
    const outputCostImage = (imageOutputTokens / 1_000_000) * rates.image_output;

    const subtotal = inputCostImage + inputCostText + outputCostImage;
    const discountRate = isBatch ? rates.batch_discount : 0;
    const discountAmount = isBatch ? subtotal * discountRate : 0;
    const finalCost = Math.max(0, subtotal - discountAmount);

    return {
      totalCost: Number(finalCost.toFixed(6)),
      totalTokens,
      usageDetails: {
        input_tokens: inputTokens,
        input_tokens_details: {
          image_tokens: imageInputTokens,
          text_tokens: textInputTokens,
        },
        output_tokens: outputTokens,
        output_tokens_details: {
          image_tokens: imageOutputTokens,
          text_tokens: textOutputTokens,
        },
        total_tokens: totalTokens,
      },
      costBreakdown: {
        input_image_cost: Number(inputCostImage.toFixed(6)),
        input_text_cost: Number(inputCostText.toFixed(6)),
        output_image_cost: Number(outputCostImage.toFixed(6)),
        subtotal: Number(subtotal.toFixed(6)),
        discount_applied: isBatch ? "50% (Batch API)" : "0%",
        discount_amount: Number(discountAmount.toFixed(6)),
        final_cost: Number(finalCost.toFixed(6)),
      },
      currency: "USD",
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. GOOGLE VERTEX AI (Imagen 3 & Gemini Image)
  // ───────────────────────────────────────────────────────────────────────────
  if (normProvider === "vertex") {
    const isImagen = model.startsWith("imagen-");
    let baseCost = 0;
    let estimatedTokens = 0;

    if (isImagen) {
      const isFast = model.includes("fast");
      const unitCost = operationType === "edit" ? 0.020 : (isFast ? 0.020 : 0.060);
      baseCost = unitCost * count;
      estimatedTokens = 1120 * count;
    } else {
      // Gemini image models (e.g. gemini-3.1-flash-image, gemini-3-pro-image)
      const isPro = model.includes("pro");
      const [w, h] = (dimensions || "1024x1024").split("x").map(Number);
      const maxDim = Math.max(w || 1024, h || 1024);

      if (isPro) {
        baseCost = (maxDim > 2048 ? 0.240 : 0.134) * count;
        estimatedTokens = (maxDim > 2048 ? 2000 : 1120) * count;
      } else {
        if (maxDim <= 512) {
          baseCost = 0.045 * count;
          estimatedTokens = 747 * count;
        } else if (maxDim <= 1024) {
          baseCost = 0.067 * count;
          estimatedTokens = 1120 * count;
        } else if (maxDim <= 2048) {
          baseCost = 0.101 * count;
          estimatedTokens = 1680 * count;
        } else {
          baseCost = 0.151 * count;
          estimatedTokens = 2520 * count;
        }
      }

      if (operationType === "edit") {
        baseCost += 0.0011; // 560 reference image tokens
        estimatedTokens += 560;
      }
    }

    const discountRate = isBatch ? 0.50 : 0;
    const finalCost = isBatch ? baseCost * 0.50 : baseCost;

    return {
      totalCost: Number(finalCost.toFixed(6)),
      totalTokens: usage?.total_tokens || estimatedTokens,
      usageDetails: usage || {
        input_tokens: operationType === "edit" ? 560 : 200,
        output_tokens: estimatedTokens,
        total_tokens: (operationType === "edit" ? 560 : 200) + estimatedTokens,
      },
      costBreakdown: {
        subtotal: Number(baseCost.toFixed(6)),
        discount_applied: isBatch ? "50% (Batch)" : "0%",
        final_cost: Number(finalCost.toFixed(6)),
      },
      currency: "USD",
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. xAI GROK IMAGINE (Per-Image Billing)
  // ───────────────────────────────────────────────────────────────────────────
  if (normProvider === "xai") {
    const rate = PRICING_RATES.xai[model] || PRICING_RATES.xai.default || 0.040;
    const baseCost = rate * count;
    const estimatedTokens = 1000 * count;

    return {
      totalCost: Number(baseCost.toFixed(6)),
      totalTokens: usage?.total_tokens || estimatedTokens,
      usageDetails: usage || {
        input_tokens: operationType === "edit" ? 600 : 200,
        output_tokens: estimatedTokens,
        total_tokens: (operationType === "edit" ? 600 : 200) + estimatedTokens,
      },
      costBreakdown: {
        model,
        rate_per_image: rate,
        image_count: count,
        subtotal: Number(baseCost.toFixed(6)),
        discount_applied: "0%",
        final_cost: Number(baseCost.toFixed(6)),
      },
      currency: "USD",
    };
  }

  // Fallback
  return {
    totalCost: 0.0,
    totalTokens: 0,
    usageDetails: null,
    costBreakdown: {},
    currency: "USD",
  };
}

module.exports = {
  calculateImageCost,
  PRICING_RATES,
};
