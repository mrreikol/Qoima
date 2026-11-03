import { useEffect, useRef, useState } from "react";
import { inventoryService } from "../services/inventoryService";

// The workspace is keyed by user ID. Cleanup also prevents late requests from committing.
export function useInventory(userId) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    products: [],
    categories: [],
    recentMovements: [],
    loading: true,
    error: "",
  });
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    inventoryService
      .load(userId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ ...data, loading: false, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            products: [],
            categories: [],
            recentMovements: [],
            loading: false,
            error: error.message,
          });
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, [userId, revision]);
  function refresh() {
    if (!active.current) return;
    setState({
      products: [],
      categories: [],
      recentMovements: [],
      loading: true,
      error: "",
    });
    setRevision((previous) => previous + 1);
  }
  async function mutate(action) {
    const result = await action();
    if (active.current) refresh();
    return result;
  }
  return {
    ...state,
    userId,
    revision,
    refresh,
    deleteCategory: (request) =>
      mutate(() => inventoryService.deleteCategory(request)),
    changeStock: (request) =>
      mutate(() => inventoryService.changeStock(request)),
    createCategory: (name) =>
      mutate(() => inventoryService.createCategory(name)),
    renameCategory: (id, name) =>
      mutate(() => inventoryService.renameCategory(id, name, userId)),
    createProduct: (fields, quantity) =>
      mutate(() => inventoryService.createProduct(fields, quantity)),
    updateProduct: (id, fields) =>
      mutate(() => inventoryService.updateProduct(id, fields, userId)),
    archiveProduct: (id) =>
      mutate(() => inventoryService.archiveProduct(id, userId)),
  };
}
