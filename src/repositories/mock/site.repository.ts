import type { SiteRepository } from "@/repositories/contracts";
import { getStore } from "./store";

export class MockSiteRepository implements SiteRepository {
  async getInfo() {
    return structuredClone(getStore().site);
  }
}
