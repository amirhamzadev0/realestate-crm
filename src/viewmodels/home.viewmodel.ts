import "server-only";

import { cache } from "react";
import { siteInfo } from "@/server/container";

export const getHomeViewModel = cache(async () => siteInfo());
