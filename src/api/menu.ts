import type { Category, CreateMenuItemPayload, MenuItem, MenuResponse, UpdateMenuItemPayload } from '@/types';
import { http } from './client';

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
    http.get<MenuResponse>('/menu').then((r) => r.data),

  createCategory: (name: string): Promise<Category> =>
    http.post<Category>('/menu/categories', { name }).then((r) => r.data),

  updateCategory: (id: number, name: string): Promise<Category> =>
    http.patch<Category>(`/menu/categories/${id}`, { name }).then((r) => r.data),

  setCategoryActive: (id: number, isActive: boolean): Promise<Category> =>
    http.patch<Category>(`/menu/categories/${id}`, { is_active: isActive }).then((r) => r.data),

  removeCategory: (id: number): Promise<void> =>
    http.delete(`/menu/categories/${id}`).then(() => undefined),

  create: (item: CreateMenuItemPayload): Promise<MenuItem> => {
    if (item.image) {
      return http
        .post<MenuItem>('/menu/items', asFormData(item), { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    }
    const { image: _, ...body } = item;
    return http.post<MenuItem>('/menu/items', body).then((r) => r.data);
  },

  update: (id: number, item: UpdateMenuItemPayload): Promise<MenuItem> => {
    if (item.image) {
      return http
        .patch<MenuItem>(`/menu/items/${id}`, asFormData(item), { headers: { 'Content-Type': 'multipart/form-data' } })
        .then((r) => r.data);
    }
    const { image: _, ...body } = item;
    return http.patch<MenuItem>(`/menu/items/${id}`, body).then((r) => r.data);
  },

  setAvailability: (id: number, isAvailable: boolean): Promise<MenuItem> =>
    http.patch<MenuItem>(`/menu/items/${id}`, { is_available: isAvailable }).then((r) => r.data),

  remove: (id: number): Promise<void> =>
    http.delete(`/menu/items/${id}`).then(() => undefined),
};
