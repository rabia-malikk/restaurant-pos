import type {
  CreateInventoryPurchasePayload,
  InventoryPurchase,
  InventoryResponse,
  ProductionPlanEntry,
} from '@/types';
import { http } from './client';

export const inventoryApi = {
  get: (): Promise<InventoryResponse> =>
    http.get<InventoryResponse>('/inventory').then((r) => r.data),

  addPurchase: (purchase: CreateInventoryPurchasePayload): Promise<InventoryPurchase> =>
    http.post<InventoryPurchase>('/inventory/purchases', purchase).then((r) => r.data),

  saveProductionPlan: (plan: ProductionPlanEntry[]): Promise<ProductionPlanEntry[]> =>
    http.put<ProductionPlanEntry[]>('/inventory/production-plan', { items: plan }).then((r) => r.data),
};
