export const fetchTimeout = async (
  url: string,
  init?: RequestInit,
  timeout: number = 5000,
): Promise<Response> => {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timerId);
  }
};
