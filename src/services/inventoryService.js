import { supabase } from "../lib/supabase";
import { createInventoryService } from "./inventoryApi.js";

export const inventoryService = createInventoryService(supabase);
