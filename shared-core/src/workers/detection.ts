/**
 * BullMQ Worker for async detection tasks
 */

import { Worker, Job } from "bullmq";
import { processAsyncDetection } from "../detectors/index";
import { DetectionRequest, DetectionIssue } from "../types/detector";

export function createDetectionWorker(redisUrl: string) {
  return new Worker(
    "detection-queue",
    async (job: Job) => {
      console.log(`Processing job ${job.id}: ${job.name}`);

      if (job.name === "async-detection") {
        const request = job.data as DetectionRequest;

        try {
          const asyncIssues = await processAsyncDetection(request);

          // Store results (in production, save to database)
          console.log(
            `Async detection complete for ${request.id}:`,
            asyncIssues.length,
            "issues found"
          );

          return {
            requestId: request.id,
            asyncIssuesFound: asyncIssues.length,
            processed: true,
          };
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
          throw error;
        }
      }

      throw new Error(`Unknown job type: ${job.name}`);
    },
    {
      connection: {
        url: redisUrl,
      } as any,
      concurrency: 5,
    }
  );
}
