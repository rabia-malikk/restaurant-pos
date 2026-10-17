import { USE_MOCK } from '@/config';
import type { CreateMenuItemPayload, MenuItem, MenuResponse, UpdateMenuItemPayload } from '@/types';
import { http } from './client';
import { mock } from './mockDb';

function asFormData(payload: CreateMenuItemPayload | UpdateMenuItemPayload) {
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && key !== 'image') form.append(key, String(value));
  });
  if (payload.image) form.append('image', payload.image);
  return form;
}

export const menuApi = {
  get: (): Promise<MenuResponse> =>
    USE_MOCK ? mock.getMenu() : http.get<MenuResponse>('/menu').then((r) => r.data),

  create: (item: CreateMenuItemPayload): Promise<MenuItem> => {
    if (USE_MOCK) return mock.createMenuItem(item);
    if (item.image) {
      return http
        .post<MenuItem>('/menu/items', asFormData(item), { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    }
    const { image: _, ...body } = item;
    return http.post<MenuItem>('/menu/items', body).then((r) => r.data);
  },

  update: (id: number, item: UpdateMenuItemPayload): Promise<MenuItem> => {
    if (USE_MOCK) return mock.updateMenuItem(id, item);
    if (item.image) {
      return http
        .patch<MenuItem>(`/menu/items/${id}`, asFormData(item), { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    }
    const { image: _, ...body } = item;
    return http.patch<MenuItem>(`/menu/items/${id}`, body).then((r) => r.data);
  },

  setAvailability: (id: number, isAvailable: boolean): Promise<MenuItem> =>
    USE_MOCK
      ? mock.setAvailability(id, isAvailable)
      : http.patch<MenuItem>(`/menu/items/${id}`, { is_available: isAvailable }).then((r) => r.data),
};
