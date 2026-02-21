import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateAreaRequest } from "@shared/routes";

// GET /api/projects/:projectId/areas
export function useAreas(projectId: number) {
  return useQuery({
    queryKey: [api.areas.list.path, projectId],
    queryFn: async () => {
      const url = buildUrl(api.areas.list.path, { projectId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch areas");
      return api.areas.list.responses[200].parse(await res.json());
    },
    enabled: !!projectId,
  });
}

// GET /api/areas/:id
export function useArea(areaId: number) {
  return useQuery({
    queryKey: [api.areas.get.path, areaId],
    queryFn: async () => {
      const url = buildUrl(api.areas.get.path, { id: areaId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch area");
      return api.areas.get.responses[200].parse(await res.json());
    },
    enabled: !!areaId,
  });
}

// POST /api/projects/:projectId/areas
export function useCreateArea(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CreateAreaRequest, "projectId">) => {
      const validated = api.areas.create.input.parse(data);
      const url = buildUrl(api.areas.create.path, { projectId });
      const res = await fetch(url, {
        method: api.areas.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.areas.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create area");
      }
      return api.areas.create.responses[201].parse(await res.json());
    },
    onSuccess: () => 
      queryClient.invalidateQueries({ queryKey: [api.areas.list.path, projectId] }),
  });
}

// PATCH /api/areas/:id
export function useUpdateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateAreaRequest> }) => {
      const validated = api.areas.update.input.parse(data);
      const url = buildUrl(api.areas.update.path, { id });
      const res = await fetch(url, {
        method: api.areas.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update area");
      }
      return api.areas.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.areas.get.path, variables.id] });
      queryClient.invalidateQueries();
    },
  });
}

// DELETE /api/areas/:id (soft delete)
export function useDeleteArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/areas/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete area");
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/areas/:id/restore-deleted (undo soft delete)
export function useRestoreDeletedArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/areas/${id}/restore-deleted`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore deleted area");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/areas/bulk-delete (soft delete multiple)
export function useBulkDeleteAreas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/areas/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete areas");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/areas/bulk-restore (restore multiple)
export function useBulkRestoreAreas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/areas/bulk-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to restore areas");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
