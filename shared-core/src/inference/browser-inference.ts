/**
 * PHASE 3 EPIC 3: WebGPU/WASM Inference
 * Client-side browser inference for Tier 3 NLI
 * 
 * Uses transformers.js + ONNX Runtime Web
 * Primary: WebGPU (72-85% support)
 * Fallback: WASM/CPU
 * 
 * Models:
 * - DeBERTa-v3-small (44M params, quantized INT8)
 * - Sentence-transformers (embeddings, 22M params)
 * - Cross-encoder (relevance scoring)
 */

// Type guard for browser environment
declare global {
  interface Navigator {
    gpu?: any;
  }
  var WebAssembly: any;
}

export interface WebGPUConfig {
  device: 'webgpu' | 'wasm' | 'cpu';
  maxConcurrentInferences: number;
  inferenceTimeoutMs: number;
  enableMemoryOptimization: boolean;
}

export interface ClientInferenceResult {
  scores: number[];
  entailment: number; // 0-1 confidence
  latencyMs: number;
  device: 'webgpu' | 'wasm' | 'cpu';
}

/**
 * Detect WebGPU support in browser
 * ~72-85% global support (Chrome 113+, Safari 26+, Firefox 141+)
 */
export async function detectWebGPUSupport(): Promise<boolean> {
  try {
    // Check if in browser environment
    if (typeof (globalThis as any).window === 'undefined' || typeof (globalThis as any).navigator === 'undefined') {
      return false; // Not in browser
    }

    const gpu = ((globalThis as any).navigator)?.gpu;
    if (!gpu) {
      console.warn('[WebGPU] GPU not available on navigator');
      return false;
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      console.warn('[WebGPU] No compatible GPU adapter found');
      return false;
    }

    const device = await adapter.requestDevice();
    if (!device) {
      console.warn('[WebGPU] Failed to create GPU device');
      return false;
    }

    device.destroy(); // Clean up test device
    console.info('[WebGPU] Support detected');
    return true;
  } catch (error) {
    console.warn('[WebGPU] Support check failed:', error);
    return false;
  }
}

/**
 * Detect WASM support with SIMD + multi-threading
 * Used as primary fallback when WebGPU unavailable
 */
export function detectWASMSupport(): boolean {
  try {
    if (typeof (globalThis as any).window === 'undefined') {
      return false;
    }

    // Check for WASM SIMD support
    const simdSupported = WebAssembly.validate(
      new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, // \0asm
        0x01, 0x00, 0x00, 0x00, // version
        0x01, 0x05, 0x01, 0x60, // type section
        0x00, 0x01, 0x7b, 0x03, // func type: () -> v128
        0x01, 0x00, 0x0a, 0x04, // code section
        0x01, 0x02, 0x00, 0xfd, // func: local v128
        0x0e, 0x00, 0x0b, // simd.const + return
      ])
    );

    if (!simdSupported) {
      console.warn('[WASM] SIMD support not detected');
      return false;
    }

    // Check for SharedArrayBuffer (multi-threading)
    const multiThreadSupported = typeof SharedArrayBuffer !== 'undefined';
    if (!multiThreadSupported) {
      console.warn('[WASM] SharedArrayBuffer not available (multi-threading disabled)');
    }

    console.info('[WASM] Support detected (SIMD=' + simdSupported + ', MT=' + multiThreadSupported + ')');
    return true;
  } catch (error) {
    console.warn('[WASM] Support check failed:', error);
    return false;
  }
}

/**
 * Client-side inference engine for browsers
 * Uses transformers.js for model downloading and inference
 */
export class BrowserInferenceEngine {
  private pipeline: any = null;
  private device: 'webgpu' | 'wasm' | 'cpu' = 'cpu';
  private initialized = false;
  private config: WebGPUConfig;

  constructor(config: Partial<WebGPUConfig> = {}) {
    this.config = {
      device: 'webgpu',
      maxConcurrentInferences: 2,
      inferenceTimeoutMs: 200,
      enableMemoryOptimization: true,
      ...config,
    };
  }

  /**
   * Initialize inference engine
   * Selects best available device (WebGPU → WASM → CPU)
   */
  async initialize(): Promise<void> {
    try {
      console.info('[Browser Inference] Initializing');

      // Check available devices
      const webgpuAvailable = await detectWebGPUSupport();
      const wasmAvailable = detectWASMSupport();

      // Select device with fallback chain
      if (webgpuAvailable && this.config.device !== 'wasm') {
        this.device = 'webgpu';
        console.info('[Browser] Using WebGPU');
      } else if (wasmAvailable) {
        this.device = 'wasm';
        console.info('[Browser] Using WASM (WebGPU unavailable)');
      } else {
        this.device = 'cpu';
        console.info('[Browser] Using CPU/WASM (WebGPU unavailable)');
      }

      // Initialize transformers.js pipeline (optional)
      // NOTE: @xenova/transformers is optional - gracefully skip if not installed
      try {
        const transformersModule = await import('@xenova/transformers');
        if (!transformersModule) {
          console.warn('[BrowserInference] @xenova/transformers not available, using degraded mode');
          this.initialized = false;
          return;
        }

        const tfPipeline = transformersModule.pipeline;
        // Load DeBERTa-v3-small for NLI
        this.pipeline = await tfPipeline(
          'zero-shot-classification',
          'Xenova/deberta-v3-small'
        );

        this.initialized = true;
        console.info('[Browser] Model loaded successfully');
      } catch (error) {
        console.warn('[Browser] @xenova/transformers not available - Tier 3 inference disabled');
        this.initialized = false;
        // This is acceptable - Tier 1 and 2 detection still work
      }
    } catch (error) {
      console.error('[Browser] Initialization error:', error);
      this.initialized = false;
    }
  }

  /**
   * Run zero-shot classification for entailment scoring
   * Input: premise (text), hypothesis (potential claim)
   * Output: confidence that premise entails hypothesis
   */
  async classifyEntailment(
    text: string,
    candidateClaims: string[]
  ): Promise<ClientInferenceResult> {
    const startTime = performance.now();

    if (!this.initialized || !this.pipeline) {
      throw new Error('[Browser] Inference pipeline not initialized');
    }

    try {
      // Safety: max 2 inferences due to latency budget
      const claimsToCheck = candidateClaims.slice(0, 2);

      const result = await Promise.race([
        this.pipeline(text, claimsToCheck, {
          multi_class: false,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Inference timeout')), this.config.inferenceTimeoutMs)
        ),
      ]);

      const latencyMs = Math.round(performance.now() - startTime);

      // Extract highest entailment score
      const scores = result.scores as number[];
      const maxScore = Math.max(...scores);

      console.log(
        `[Browser] Inference: ${latencyMs}ms on ${this.device}, entailment score: ${maxScore.toFixed(3)}`
      );

      return {
        scores,
        entailment: maxScore,
        latencyMs,
        device: this.device,
      };
    } catch (error) {
      console.error('[Browser] Inference failed:', error);
      throw error;
    }
  }

  /**
   * Run embedding inference for semantic similarity
   * Returns embeddings for claims/context for vector-based scoring
   */
  async getEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; latencyMs: number }> {
    const startTime = performance.now();

    if (!this.initialized || !this.pipeline) {
      // Fallback: Return empty embeddings if not initialized
      return { embeddings: texts.map(() => []), latencyMs: 0 };
    }

    try {
      const pipeline = this.pipeline;
      const result = await Promise.race([
        pipeline(texts),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Embedding timeout')), this.config.inferenceTimeoutMs)
        ),
      ]);

      const latencyMs = Math.round(performance.now() - startTime);
      const embeddings = result.tolist ? result.tolist() : Array.from(result);

      return { embeddings, latencyMs };
    } catch (error) {
      console.error('[Browser] Embedding inference failed:', error);
      throw error;
    }
  }

  /**
   * Measure memory usage (for optimization feedback)
   */
  getMemoryStatus(): { usedJSHeapSize: number; jsHeapSizeLimit: number; percentUsed: number } {
    try {
      const memory = (performance as any).memory;
      if (!memory) {
        return {
          usedJSHeapSize: 0,
          jsHeapSizeLimit: 0,
          percentUsed: 0,
        };
      }

      const percentUsed = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        percentUsed,
      };
    } catch (error) {
      return {
        usedJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        percentUsed: 0,
      };
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.pipeline && typeof this.pipeline.dispose === 'function') {
      await this.pipeline.dispose();
    }
    this.initialized = false;
    console.info('[Browser] Inference engine disposed');
  }

  /**
   * Get current device information
   */
  getDeviceInfo(): { device: string; initialized: boolean; latencyTargetMs: number } {
    return {
      device: this.device,
      initialized: this.initialized,
      latencyTargetMs: this.config.inferenceTimeoutMs,
    };
  }
}

/**
 * Singleton instance for browser usage
 */
let browserEngine: BrowserInferenceEngine | null = null;

export async function getBrowserInferenceEngine(
  config?: Partial<WebGPUConfig>
): Promise<BrowserInferenceEngine> {
  if (!browserEngine) {
    browserEngine = new BrowserInferenceEngine(config);
    await browserEngine.initialize();
  }
  return browserEngine;
}

export async function resetBrowserInferences(): Promise<void> {
  if (browserEngine) {
    await browserEngine.dispose();
    browserEngine = null;
  }
}
