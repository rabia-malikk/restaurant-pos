import { USE_MOCK } from '@/config';
import type {
  CreateInventoryPurchasePayload,
  InventoryPurchase,
  InventoryResponse,
  ProductionPlanEntry,
} from '@/types';
import { http } from './client';
import { mock } from './mockDb';

export const inventoryApi = {
  get: (): Promise<InventoryResponse> =>
    USE_MOCK ? mock.getInventory() : http.get<InventoryResponse>('/inventory').then((r) => r.data),

  addPurchase: (purchase: CreateInventoryPurchasePayload): Promise<InventoryPurchase> =>
    USE_MOCK
      ? mock.addInventoryPurchase(purchase)
      : http.post<InventoryPurchase>('/inventory/purchases', purchase).then((r) => r.data),

  saveProductionPlan: (plan: ProductionPlanEntry[]): Promise<ProductionPlanEntry[]> =>
    USE_MOCK
      ? mock.saveProductionPlan(plan)
      : http.put<ProductionPlanEntry[]>('/inventory/production-plan', { items: plan }).then((r) => r.data),
};
