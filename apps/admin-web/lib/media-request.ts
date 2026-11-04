import { api } from "../components/api";
/** Bound a media request. Aborting does not undo a server commit; retries reuse keys. */
export async function mediaRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 120000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await api<T>(path, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Kết nối quá chậm hoặc gián đoạn. Bản ghi vẫn được giữ trên máy; thử tải lại khi mạng ổn định.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
