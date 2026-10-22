import "server-only";

import { MemorySessionRepository, MemoryUserRepository } from "@/repositories/auth/memory.repository";
import { MysqlSessionRepository, MysqlUserRepository } from "@/repositories/auth/mysql.repository";
import { MockChangeRequestRepository } from "@/repositories/mock/change-request.repository";
import { MockAccountRepository } from "@/repositories/mock/account.repository";
import { MockManagerRepository } from "@/repositories/mock/manager.repository";
import { MockHrRepository } from "@/repositories/mock/hr.repository";
import { MockInventoryRepository } from "@/repositories/mock/inventory.repository";
import { MockProjectRepository } from "@/repositories/mock/project.repository";
import { MockSalesRepository } from "@/repositories/mock/sales.repository";
import { MockSiteRepository } from "@/repositories/mock/site.repository";
import { MysqlAccountRepository } from "@/repositories/mysql/account.repository";
import { MysqlChangeRequestRepository } from "@/repositories/mysql/change-request.repository";
import { MysqlHrRepository } from "@/repositories/mysql/hr.repository";
import { MysqlInventoryRepository } from "@/repositories/mysql/inventory.repository";
import { MysqlManagerRepository } from "@/repositories/mysql/manager.repository";
import { MysqlProjectRepository } from "@/repositories/mysql/project.repository";
import { MysqlSalesRepository } from "@/repositories/mysql/sales.repository";
import { loadBootstrapUsers } from "@/server/auth/bootstrap-users";
import { AccountService } from "@/services/account.service";
import { AuthService } from "@/services/auth.service";
import { ChangeRequestService } from "@/services/change-request.service";
import { HrService } from "@/services/hr.service";
import { InventoryService } from "@/services/inventory.service";
import { ProjectService } from "@/services/project.service";
import { SalesService } from "@/services/sales.service";

// The only place adapters are constructed. DATA_STORAGE=mysql uses the database; anything else
// keeps the in-memory demo data (and local sign-in from .private/users.json).
export const useMysql = process.env.DATA_STORAGE === "mysql";

const siteRepository = new MockSiteRepository();
const projectRepository = useMysql ? new MysqlProjectRepository() : new MockProjectRepository();

export const siteInfo = () => siteRepository.getInfo();
const accountRepository = useMysql ? new MysqlAccountRepository() : new MockAccountRepository();
const salesRepository = useMysql ? new MysqlSalesRepository() : new MockSalesRepository();
export const projectService = new ProjectService(
  projectRepository,
  useMysql ? new MysqlManagerRepository() : new MockManagerRepository(),
  salesRepository,
);
export const accountService = new AccountService(accountRepository, projectRepository);
export const inventoryService = new InventoryService(
  useMysql ? new MysqlInventoryRepository() : new MockInventoryRepository(),
  projectRepository,
  accountRepository,
);
export const hrService = new HrService(useMysql ? new MysqlHrRepository() : new MockHrRepository(), projectRepository);
export const salesService = new SalesService(salesRepository, projectRepository, accountRepository);
export const changeRequestService = new ChangeRequestService(
  useMysql ? new MysqlChangeRequestRepository() : new MockChangeRequestRepository(),
  projectRepository,
  hrService,
  salesService,
);

// In mock mode sessions live in memory; keep them on globalThis so dev hot reload does not sign everyone out.
const SESSIONS_KEY = "__buildflow_sessions__";
type GlobalWithSessions = typeof globalThis & { [SESSIONS_KEY]?: MemorySessionRepository };
function memorySessions(): MemorySessionRepository {
  const g = globalThis as GlobalWithSessions;
  g[SESSIONS_KEY] ??= new MemorySessionRepository();
  return g[SESSIONS_KEY];
}

export const authService = new AuthService(
  useMysql ? new MysqlUserRepository() : new MemoryUserRepository(loadBootstrapUsers()),
  useMysql ? new MysqlSessionRepository() : memorySessions(),
  projectRepository,
);
