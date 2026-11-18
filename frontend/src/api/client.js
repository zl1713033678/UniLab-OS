import { useEffect, useRef } from 'react';

export const API_BASE = import.meta.env.VITE_API_BASE ?? '';
export const DEFAULT_HW_TOKEN = 'UNILAB_HW_SECRET_2026';

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || `HTTP ${res.status}` };
  }
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json.detail || `请求失败 (${res.status})`);
  return json;
}

export async function apiPost(path, bodyObj, customHeaders = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...customHeaders },
    body: JSON.stringify(bodyObj),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
  return json;
}

export async function apiPut(path, bodyObj) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
  return json;
}

export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  const json = await parseJsonSafe(res);
  if (!res.ok) throw new Error(json.detail || JSON.stringify(json));
  return json;
}

export function exportTableToCSV(filename, headers, rows) {
  const csvContent =
    '\uFEFF' +
    [
      headers.join(','),
      ...rows.map((r) =>
        r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 自动重连的 WebSocket 实验室状态同步 Hook，对接后端 /ws/lab-status
 */
export function useLabWebSocket(enabled, onDevicesEvent, onStatusChange) {
  const onEventRef = useRef(onDevicesEvent);
  const onStatusRef = useRef(onStatusChange);
  onEventRef.current = onDevicesEvent;
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let ws = null;
    let timer = null;
    let closedByUser = false;
    let attempt = 0;

    const getWsUrl = () => {
      if (API_BASE && API_BASE.startsWith('http')) {
        return `${API_BASE.replace(/^http/, 'ws')}/ws/lab-status`;
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws/lab-status`;
    };

    const connect = () => {
      if (closedByUser) return;
      try {
        ws = new WebSocket(getWsUrl());
        ws.onopen = () => {
          attempt = 0;
          onStatusRef.current?.('connected');
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (Array.isArray(msg?.devices)) {
              onEventRef.current?.(msg.devices, msg.event);
            }
          } catch {
            // 忽略非 JSON 心跳
          }
        };
        ws.onclose = () => {
          onStatusRef.current?.('reconnecting');
          if (!closedByUser) {
            const delay = Math.min(15000, 1500 * 2 ** Math.min(attempt, 3));
            attempt += 1;
            timer = window.setTimeout(connect, delay);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        onStatusRef.current?.('offline');
      }
    };

    connect();

    return () => {
      closedByUser = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [enabled]);
}
