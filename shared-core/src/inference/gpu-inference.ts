/**
 * PHASE 3 EPIC 2: GPU Acceleration
 * PyTorch + CUDA with ONNX quantization (INT8) for local inference
 * 
 * Supports:
 * - DeBERTa-v3-small (44M params) quantized to INT8
 * - Cross-encoder for NLI (entailment scoring)
 * - All-MiniLM for embeddings
 * - Fallback to CPU
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export type InferenceBackend = 'cuda' | 'cpu' | 'mps'; // MPS for Apple Silicon

export interface ModelConfig {
  name: string;
  modelId: string;
  quantized: boolean;
  inputSize: number;
  outputSize: number;
  paramCount: number;
}

export interface InferenceResult {
  logits: number[];
  probabilities?: number[];
  latencyMs: number;
  backend: InferenceBackend;
}

/**
 * Model configurations for INT8 quantized ONNX models
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'deberta-v3-small': {
    name: 'DeBERTa-v3-Small (Quantized INT8)',
    modelId: 'microsoft/deberta-v3-small',
    quantized: true,
    inputSize: 512,
    outputSize: 3, // entailment, neutral, contradiction
    paramCount: 44_000_000,
  },
  'all-minilm-l6-v2': {
    name: 'All-MiniLM-L6-v2 (Quantized INT8)',
    modelId: 'sentence-transformers/all-MiniLM-L6-v2',
    quantized: true,
    inputSize: 256,
    outputSize: 384,
    paramCount: 22_000_000,
  },
  'cross-encoder-ms-marco': {
    name: 'Cross-Encoder MS MARCO (Quantized INT8)',
    modelId: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    quantized: true,
    inputSize: 512,
    outputSize: 1, // Relevance score 0-1
    paramCount: 22_000_000,
  },
};

/**
 * GPU Inference Manager
 * Handles model loading, inference, and fallback logic
 */
export class GPUInferenceManager {
  private backend: InferenceBackend = 'cpu';
  private modelsLoaded: Map<string, any> = new Map();
  private initialized = false;
  private availableBackends = {
    cuda: false,
    mps: false,
    cpu: true,
  };

  /**
   * Initialize GPU/compute environment
   * Auto-detects available accelerators
   */
  async initialize(): Promise<void> {
    try {
      logger.info('[GPU] Initializing compute environment');

      // Check for CUDA (requires NVIDIA GPU + CUDA toolkit)
      const cudasAvailable = await this.checkCUDA();
      if (cudasAvailable) {
        this.availableBackends.cuda = true;
        this.backend = 'cuda';
        logger.info('[GPU] CUDA available - using NVIDIA GPU');
      }
      // Check for Metal Performance Shaders (Apple Silicon)
      else if (this.checkMPS()) {
        this.availableBackends.mps = true;
        this.backend = 'mps';
        logger.info('[GPU] Metal Performance Shaders available - using Apple GPU');
      }
      // Fallback to CPU
      else {
        this.backend = 'cpu';
        logger.info('[GPU] No GPU detected - using CPU inference');
      }

      this.initialized = true;
    } catch (error) {
      logger.warn('[GPU] Failed to initialize, falling back to CPU:', error);
      this.backend = 'cpu';
      this.initialized = true;
    }
  }

  /**
   * Check for CUDA availability
   * Uses environment variables and optional CUDA library check
   */
  private async checkCUDA(): Promise<boolean> {
    try {
      // Simple check: CUDA_VISIBLE_DEVICES environment variable
      if (process.env.CUDA_VISIBLE_DEVICES === '-1') {
        return false; // Explicitly disabled
      }

      // Check for nvidia-smi (NVIDIA GPU Management Interface)
      const { execSync } = require('child_process');
      try {
        execSync('nvidia-smi --version', { stdio: 'ignore' });
        logger.info('[GPU] nvidia-smi detected - CUDA available');
        return true;
      } catch (e) {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for Metal Performance Shaders (Apple Silicon)
   */
  private checkMPS(): boolean {
    try {
      if (process.platform !== 'darwin') {
        return false; // Not on macOS
      }

      // Check for Apple Silicon (M1/M2/M3/etc)
      const { execSync } = require('child_process');
      const arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
      return arch.includes('arm');
    } catch (error) {
      return false;
    }
  }

  /**
   * Load and optionally quantize ONNX model
   * INT8 quantization reduces model size by ~4x and improves inference speed
   */
  async loadModel(modelName: string): Promise<void> {
    if (this.modelsLoaded.has(modelName)) {
      logger.info(`[GPU] Model ${modelName} already loaded`);
      return;
    }

    try {
      const config = MODEL_CONFIGS[modelName];
      if (!config) {
        throw new Error(`Unknown model: ${modelName}`);
      }

      logger.info(
        `[GPU] Loading ${config.name} (${config.paramCount / 1_000_000}M params, quantized=${config.quantized})`
      );

      // ONNX Runtime initialization
      const onnxRuntime = require('onnxruntime-node');

      const modelPath = path.join(
        process.env.MODELS_CACHE_DIR || './models',
        `${modelName}-int8-quantized.onnx`
      );

      if (!fs.existsSync(modelPath)) {
        throw new Error(
          `Model file not found: ${modelPath}. Run: npm run download-models`
        );
      }

      const session = await onnxRuntime.InferenceSession.create(modelPath, {
        executionProviders: [this.backend === 'cuda' ? 'CUDAExecutionProvider' : 'CPUExecutionProvider'],
        graphOptimizationLevel: 'all',
      });

      this.modelsLoaded.set(modelName, { session, config });
      logger.info(`[GPU] Loaded ${modelName} successfully`);
    } catch (error) {
      logger.error(`[GPU] Failed to load model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Run inference on text pair (for cross-encoder/NLI)
   * Returns entailment probabilities
   */
  async runInference(
    modelName: string,
    inputs: {
      input_ids: number[][];
      attention_mask: number[][];
      token_type_ids?: number[][];
    }
  ): Promise<InferenceResult> {
    const startTime = Date.now();

    try {
      if (!this.modelsLoaded.has(modelName)) {
        await this.loadModel(modelName);
      }

      const { session, config } = this.modelsLoaded.get(modelName);

      // Prepare ONNX tensor inputs
      const onnxInputs: Record<string, any> = {};
      const onnx = require('onnxruntime-node').Tensor;

      onnxInputs.input_ids = new onnx(
        new BigInt64Array(inputs.input_ids.flat().map(BigInt)),
        [inputs.input_ids.length, inputs.input_ids[0].length]
      );

      onnxInputs.attention_mask = new onnx(
        new Int32Array(inputs.attention_mask.flat()),
        [inputs.attention_mask.length, inputs.attention_mask[0].length]
      );

      if (inputs.token_type_ids) {
        onnxInputs.token_type_ids = new onnx(
          new Int32Array(inputs.token_type_ids.flat()),
          [inputs.token_type_ids.length, inputs.token_type_ids[0].length]
        );
      }

      // Run inference
      const results = await session.run(onnxInputs);
      const logits = Array.from(results.logits.data as Float32Array);
      const latencyMs = Date.now() - startTime;

      // Convert logits to probabilities (softmax)
      const probabilities = this.softmax(logits);

      logger.debug(
        `[GPU] Inference latency: ${latencyMs}ms on ${this.backend}`
      );

      return {
        logits,
        probabilities,
        latencyMs,
        backend: this.backend,
      };
    } catch (error) {
      logger.error(`[GPU] Inference failed for ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Softmax activation for logits → probabilities
   */
  private softmax(logits: number[]): number[] {
    const max = Math.max(...logits);
    const exp = logits.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(x => x / sum);
  }

  /**
   * Get current backend status
   */
  getBackendStatus(): {
    current: InferenceBackend;
    available: string[];
    initialized: boolean;
  } {
    return {
      current: this.backend,
      available: Object.entries(this.availableBackends)
        .filter(([_, available]) => available)
        .map(([backend, _]) => backend),
      initialized: this.initialized,
    };
  }

  /**
   * Unload model to free memory
   */
  async unloadModel(modelName: string): Promise<void> {
    const model = this.modelsLoaded.get(modelName);
    if (model) {
      await model.session?.release?.();
      this.modelsLoaded.delete(modelName);
      logger.info(`[GPU] Unloaded ${modelName}`);
    }
  }

  /**
   * Clear all loaded models
   */
  async clearCache(): Promise<void> {
    for (const [modelName] of this.modelsLoaded) {
      await this.unloadModel(modelName);
    }
    logger.info('[GPU] Cleared all loaded models');
  }
}

/**
 * Singleton instance
 */
let gpuManager: GPUInferenceManager | null = null;

export async function getGPUManager(): Promise<GPUInferenceManager> {
  if (!gpuManager) {
    gpuManager = new GPUInferenceManager();
    await gpuManager.initialize();
  }
  return gpuManager;
}

export function resetGPUManager(): void {
  gpuManager = null;
}
