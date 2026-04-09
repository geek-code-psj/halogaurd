/**
 * useRealtimeData Hook
 * Manages WebSocket connection for real-time dashboard updates
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { ScanResult, ActivityEntry, ActivityDataPoint } from '../types/dashboard';

interface UseRealtimeDataProps {
  url: string;
  onError?: (error: string) => void;
}

export const useRealtimeData = ({ url, onError }: UseRealtimeDataProps) => {
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [activityGraph, setActivityGraph] = useState<ActivityDataPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const errorHandler = useCallback(
    (error: string) => {
      if (onError) onError(error);
    },
    [onError]
  );

  useEffect(() => {
    const connectWebSocket = () => {
      try {
        wsRef.current = new WebSocket(url);

        wsRef.current.onopen = () => {
          setIsConnected(true);
        };

        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'scan_result') {
              setCurrentScan(data.payload);
            } else if (data.type === 'activity_entry') {
              setRecentActivity((prev) => [data.payload, ...prev].slice(0, 20));
            } else if (data.type === 'activity_graph') {
              setActivityGraph(data.payload);
            }
          } catch (err) {
            errorHandler(`Failed to parse WebSocket message: ${err}`);
          }
        };

        wsRef.current.onerror = () => {
          errorHandler('WebSocket connection error');
          setIsConnected(false);
        };

        wsRef.current.onclose = () => {
          setIsConnected(false);
          // Attempt reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000);
        };
      } catch (err) {
        errorHandler(`WebSocket connection failed: ${err}`);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, errorHandler]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    currentScan,
    recentActivity,
    activityGraph,
    isConnected,
    sendMessage,
  };
};
