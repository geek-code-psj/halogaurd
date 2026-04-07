/**
 * Feedback Loop Manager
 * Collects false positive/negative feedback and auto-recalibrates
 */

export interface FeedbackEntry {
  id: string;
  issueId: string;
  verdict: 'correct' | 'false_positive' | 'false_negative';
  userReason?: string;
  timestamp: number;
  modelVersion: string;
}

export interface RecalibrationMetrics {
  totalFeedback: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
  lastUpdated: number;
}

/**
 * Store feedback locally (browser storage or local DB)
 */
export async function storeFeedback(feedback: FeedbackEntry): Promise<void> {
  try {
    // Try IndexedDB first (Chrome/Firefox)
    if ('indexedDB' in window) {
      const db = await openDatabase();
      const tx = db.transaction(['feedback'], 'readwrite');
      const store = tx.objectStore('feedback');
      await store.add(feedback);
      return;
    }
  } catch (error) {
    console.warn('IndexedDB failed, falling back to localStorage:', error);
  }

  // Fallback to localStorage (limited capacity)
  try {
    const existing = JSON.parse(localStorage.getItem('haloguard_feedback') || '[]');
    existing.push(feedback);
    localStorage.setItem('haloguard_feedback', JSON.stringify(existing.slice(-100)));
  } catch (error) {
    console.error('Storage failed:', error);
  }
}

/**
 * Retrieve feedback for analysis
 */
export async function retrieveFeedback(limit: number = 100): Promise<FeedbackEntry[]> {
  try {
    if ('indexedDB' in window) {
      const db = await openDatabase();
      const tx = db.transaction(['feedback'], 'readonly');
      const store = tx.objectStore('feedback');
      return await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.slice(-limit));
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.warn('IndexedDB failed:', error);
  }

  // Fallback to localStorage
  try {
    const feedback = JSON.parse(localStorage.getItem('haloguard_feedback') || '[]');
    return feedback.slice(-limit);
  } catch (error) {
    return [];
  }
}

/**
 * Calculate detection accuracy from feedback
 */
export async function calculateMetrics(): Promise<RecalibrationMetrics> {
  const feedback = await retrieveFeedback();

  if (feedback.length === 0) {
    return {
      totalFeedback: 0,
      falsePositives: 0,
      falseNegatives: 0,
      accuracy: 0,
      lastUpdated: Date.now(),
    };
  }

  const falsePositives = feedback.filter((f) => f.verdict === 'false_positive').length;
  const falseNegatives = feedback.filter((f) => f.verdict === 'false_negative').length;
  const correct = feedback.filter((f) => f.verdict === 'correct').length;

  return {
    totalFeedback: feedback.length,
    falsePositives,
    falseNegatives,
    accuracy: correct / feedback.length,
    lastUpdated: Date.now(),
  };
}

/**
 * Auto-recalibrate thresholds based on feedback
 */
export async function autoRecalibrate(): Promise<void> {
  const metrics = await calculateMetrics();

  if (metrics.falsePositives / metrics.totalFeedback > 0.2) {
    // Raise confidence threshold (fewer false positives)
    console.log('[HaloGuard] Raising confidence threshold due to false positives');
    localStorage.setItem('haloguard_confidence_threshold', JSON.stringify(0.75));
  }

  if (metrics.falseNegatives / metrics.totalFeedback > 0.15) {
    // Lower confidence threshold (catch more real issues)
    console.log('[HaloGuard] Lowering confidence threshold due to false negatives');
    localStorage.setItem('haloguard_confidence_threshold', JSON.stringify(0.55));
  }
}

/**
 * Send feedback to backend for model training (optional)
 */
export async function sendFeedbackToBackend(
  feedback: FeedbackEntry,
  backendUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });

    return response.ok;
  } catch (error) {
    console.warn('Failed to send feedback to backend:', error);
    return false;
  }
}

/**
 * Open IndexedDB for local storage
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HaloGuard', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('feedback')) {
        db.createObjectStore('feedback', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}
