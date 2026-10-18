import axios from 'axios';
import { API_URL } from '@/config';
import { ApiError } from '@/lib/errors';

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true, // the JWT travels in an httpOnly cookie
  headers: { 'Content-Type': 'application/json' },
});

let onUnauthorized: () => void = () => {};

/** Called once at startup so a 401 from any request signs the user out. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    let status = 0;
    let message = 'Cannot reach the server. Check the connection.';
    let code: string | undefined;

    if (axios.isAxiosError(error)) {
      status = error.response?.status ?? 0;
      const data = error.response?.data as { code?: string; message?: string } | undefined;
      code = data?.code;
      if (data?.message) message = data.message;
      else if (status) message = error.message;
    }

    if (status === 401) onUnauthorized();
    return Promise.reject(new ApiError(status, message, code));
  },
);
